// FloatFrame Casino : serveur (Cloudflare Worker + D1)
// Toute la logique (comptes, soldes, tirages, cartes, mines) est gérée ici côté serveur.

const START_BALANCE = 1000;
const DAILY_BONUS = 500;
const DAILY_MS = 24 * 3600 * 1000;
const MAX_BET = 50000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const PBKDF2_ITER = 100000;
const MAX_REG_PER_IP_HOUR = 5;
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;
const ACCOUNT_MAX_FAILS = 30; // verrou global du compte (toutes IP confondues)
const ACCOUNT_LOCK_MS = 5 * 60 * 1000;
const GAME_TTL_MS = 24 * 3600 * 1000; // une partie abandonnée depuis plus de 24 h est perdue

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-max-age": "86400",
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: {
      ...CORS,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// ---------- Crypto ----------
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITER },
    key,
    256
  );
  return toHex(bits);
}

const sha256Hex = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Entier uniforme dans [0, n) sans biais
function randInt(n) {
  const max = Math.floor(2 ** 32 / n) * n;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= max);
  return a[0] % n;
}

// ---------- Initialisation automatique des tables additionnelles ----------
let tablesInit = false;
async function ensureTables(db) {
  if (tablesInit) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS blackjack_games (
        user_id INTEGER PRIMARY KEY,
        bet INTEGER NOT NULL,
        player_cards TEXT NOT NULL,
        dealer_cards TEXT NOT NULL,
        deck TEXT NOT NULL,
        status TEXT NOT NULL,
        updated INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS mines_games (
        user_id INTEGER PRIMARY KEY,
        bet INTEGER NOT NULL,
        mines_count INTEGER NOT NULL,
        mine_indices TEXT NOT NULL,
        revealed TEXT NOT NULL,
        updated INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS login_fails (
        ip TEXT NOT NULL,
        name_lower TEXT NOT NULL,
        fails INTEGER NOT NULL DEFAULT 0,
        lock_until INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ip, name_lower)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS site_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        folder TEXT NOT NULL,
        author TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        action_token TEXT NOT NULL UNIQUE,
        ip TEXT NOT NULL,
        created INTEGER NOT NULL,
        reviewed_at INTEGER
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_suggestions_status ON site_suggestions (status)`),
    ]);
    tablesInit = true;
  } catch (e) {
    console.error("ensureTables error:", e);
  }
}

// ---------- Jeux Instantanés (slots, coin, roulette) ----------
const SLOT_PAYS = [7, 24, 14, 9, 40]; // 🍒 🍋 🔔 ⭐ 7
const SLOT_PAIR = 0.4;
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const GAMES = {
  coin(choice) {
    if (!choice || !["pile", "face"].includes(choice.side)) throw new HttpError(400, "Choix invalide");
    const side = randInt(2) ? "pile" : "face";
    return { result: { side }, mult: side === choice.side ? 1.95 : 0 };
  },
  slots() {
    const reels = [randInt(5), randInt(5), randInt(5)];
    let mult = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) mult = SLOT_PAYS[reels[0]];
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) mult = SLOT_PAIR;
    return { result: { reels }, mult };
  },
  roulette(choice) {
    const n = randInt(37);
    const color = n === 0 ? "green" : REDS.has(n) ? "red" : "black";
    const t = choice && choice.type;
    let win = false;
    let mult = 0;

    if (t === "number") {
      if (!Number.isInteger(choice.number) || choice.number < 0 || choice.number > 36) {
        throw new HttpError(400, "Numéro invalide (0 à 36)");
      }
      return { result: { number: n, color }, mult: n === choice.number ? 36 : 0 };
    }

    if (n === 0) {
      win = false;
    } else if (t === "red") { win = color === "red"; mult = 2; }
    else if (t === "black") { win = color === "black"; mult = 2; }
    else if (t === "even") { win = n % 2 === 0; mult = 2; }
    else if (t === "odd") { win = n % 2 === 1; mult = 2; }
    else if (t === "low") { win = n >= 1 && n <= 18; mult = 2; }
    else if (t === "high") { win = n >= 19 && n <= 36; mult = 2; }
    else if (t === "dozen1") { win = n >= 1 && n <= 12; mult = 3; }
    else if (t === "dozen2") { win = n >= 13 && n <= 24; mult = 3; }
    else if (t === "dozen3") { win = n >= 25 && n <= 36; mult = 3; }
    else if (t === "col1") { win = n % 3 === 1; mult = 3; }
    else if (t === "col2") { win = n % 3 === 2; mult = 3; }
    else if (t === "col3") { win = n % 3 === 0; mult = 3; }
    else {
      throw new HttpError(400, "Type de pari roulette invalide");
    }

    return { result: { number: n, color }, mult: win ? mult : 0 };
  },
};

// ---------- Blackjack Logic ----------
function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const vals = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];
  for (let d = 0; d < 4; d++) {
    for (const s of suits) {
      for (const v of vals) deck.push(v + s);
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = c.slice(0, -1);
    if (v === "A") {
      aces++;
      total += 11;
    } else if (["K", "Q", "J"].includes(v)) {
      total += 10;
    } else {
      total += parseInt(v, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const isNaturalBJ = (cards) => cards.length === 2 && handValue(cards) === 21;

// Règle une partie de façon atomique : verse le gain ET supprime la partie dans un seul batch.
// Si la partie n'existe plus (requête concurrente déjà traitée), rien n'est versé -> pas de double paiement.
async function settle(db, table, userId, payout, status = null, extra = "", binds = []) {
  const cond = `user_id = ?${status ? " AND status = ?" : ""}${extra}`;
  const cb = [userId, ...(status ? [status] : []), ...binds];
  const [upd] = await db.batch([
    db.prepare(
      `UPDATE users SET balance = balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM ${table} WHERE ${cond}) RETURNING balance`
    ).bind(payout, userId, ...cb),
    db.prepare(`DELETE FROM ${table} WHERE ${cond}`).bind(...cb),
  ]);
  const row = upd.results && upd.results[0];
  if (!row) throw new HttpError(409, "Partie déjà terminée");
  return row.balance;
}

// Supprime une partie perdue (sans paiement). Échoue si une requête concurrente l'a déjà réglée.
async function forfeit(db, table, userId, status = null) {
  const row = await db.prepare(
    `DELETE FROM ${table} WHERE user_id = ?${status ? " AND status = ?" : ""} RETURNING user_id`
  ).bind(userId, ...(status ? [status] : [])).first();
  if (!row) throw new HttpError(409, "Partie déjà terminée");
  const cur = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(userId).first();
  return cur.balance;
}

const purgeStale = (db, table, userId) =>
  db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND updated < ?`).bind(userId, Date.now() - GAME_TTL_MS).run();

async function getBjGame(db, userId) {
  const row = await db.prepare("SELECT * FROM blackjack_games WHERE user_id = ?").bind(userId).first();
  if (!row) return null;
  return {
    ...row,
    playerCards: JSON.parse(row.player_cards),
    dealerCards: JSON.parse(row.dealer_cards),
    deck: JSON.parse(row.deck),
  };
}

async function bjState(db, user) {
  await purgeStale(db, "blackjack_games", user.id);
  const g = await getBjGame(db, user.id);
  if (!g) return json({ active: false });
  return json({
    active: true,
    bet: g.bet,
    player: { cards: g.playerCards, score: handValue(g.playerCards) },
    dealer: { cards: [g.dealerCards[0], "?"], score: handValue([g.dealerCards[0]]) },
    canDouble: g.status === "playing" && g.playerCards.length === 2 && user.balance >= g.bet,
    status: g.status,
  });
}

async function bjDeal(req, db, user) {
  const { bet } = await readBody(req);
  if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) throw new HttpError(400, `Mise entre 1 et ${MAX_BET}`);

  await purgeStale(db, "blackjack_games", user.id);
  if (await getBjGame(db, user.id)) throw new HttpError(400, "Une partie de Blackjack est déjà en cours. Termine-la d'abord !");

  const deck = createDeck();
  const playerCards = [deck.pop(), deck.pop()];
  const dealerCards = [deck.pop(), deck.pop()];
  const pScore = handValue(playerCards);
  const pBJ = isNaturalBJ(playerCards);
  const dBJ = isNaturalBJ(dealerCards);

  // Partie réglée immédiatement : un seul UPDATE atomique (mise + gain)
  if (pBJ || dBJ) {
    let status, payout, delta;
    if (pBJ && dBJ) { status = "push"; payout = bet; delta = 0; }
    else if (pBJ) { status = "blackjack"; delta = Math.floor(bet * 1.5); payout = bet + delta; }
    else { status = "dealer_blackjack"; payout = 0; delta = -bet; }

    const row = await db.prepare(
      "UPDATE users SET balance = balance + ? WHERE id = ? AND balance >= ? RETURNING balance"
    ).bind(delta, user.id, bet).first();
    if (!row) throw new HttpError(400, "Solde insuffisant");
    return json({
      active: false,
      bet,
      player: { cards: playerCards, score: pScore },
      dealer: { cards: dealerCards, score: handValue(dealerCards) },
      status,
      payout,
      delta,
      balance: row.balance,
    });
  }

  // On crée d'abord la partie (la clé primaire empêche deux parties simultanées), puis on débite la mise.
  try {
    await db.prepare(
      "INSERT INTO blackjack_games (user_id, bet, player_cards, dealer_cards, deck, status, updated) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(user.id, bet, JSON.stringify(playerCards), JSON.stringify(dealerCards), JSON.stringify(deck), "playing", Date.now()).run();
  } catch (e) {
    if (String(e.message || e).includes("UNIQUE")) throw new HttpError(400, "Une partie de Blackjack est déjà en cours");
    throw e;
  }
  const userRow = await db.prepare(
    "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(bet, user.id, bet).first();
  if (!userRow) {
    await db.prepare("DELETE FROM blackjack_games WHERE user_id = ?").bind(user.id).run();
    throw new HttpError(400, "Solde insuffisant");
  }

  return json({
    active: true,
    bet,
    player: { cards: playerCards, score: pScore },
    dealer: { cards: [dealerCards[0], "?"], score: handValue([dealerCards[0]]) },
    canDouble: userRow.balance >= bet,
    status: "playing",
    balance: userRow.balance,
  });
}

// `expected` : statut que la partie doit avoir en base ("playing", ou "doubling" après un doublement)
async function resolveDealer(db, user, g, expected = "playing") {
  let dScore = handValue(g.dealerCards);
  while (dScore < 17) {
    g.dealerCards.push(g.deck.pop());
    dScore = handValue(g.dealerCards);
  }

  const pScore = handValue(g.playerCards);
  let status, payout, delta;
  if (dScore > 21) { status = "dealer_bust"; payout = g.bet * 2; delta = g.bet; }
  else if (pScore > dScore) { status = "win"; payout = g.bet * 2; delta = g.bet; }
  else if (pScore === dScore) { status = "push"; payout = g.bet; delta = 0; }
  else { status = "lose"; payout = 0; delta = -g.bet; }

  const finalBal = await settle(db, "blackjack_games", user.id, payout, expected);

  return json({
    active: false,
    bet: g.bet,
    player: { cards: g.playerCards, score: pScore },
    dealer: { cards: g.dealerCards, score: dScore },
    status,
    payout,
    delta,
    balance: finalBal,
  });
}

async function bjHit(db, user) {
  const g = await getBjGame(db, user.id);
  if (!g || g.status !== "playing") throw new HttpError(400, "Aucune partie en cours");

  g.playerCards.push(g.deck.pop());
  const pScore = handValue(g.playerCards);

  if (pScore > 21) {
    const balance = await forfeit(db, "blackjack_games", user.id, "playing");
    return json({
      active: false,
      bet: g.bet,
      player: { cards: g.playerCards, score: pScore },
      dealer: { cards: g.dealerCards, score: handValue(g.dealerCards) },
      status: "bust",
      payout: 0,
      delta: -g.bet,
      balance,
    });
  }

  if (pScore === 21) return await resolveDealer(db, user, g);

  const upd = await db.prepare(
    "UPDATE blackjack_games SET player_cards = ?, deck = ?, updated = ? WHERE user_id = ? AND status = 'playing' RETURNING user_id"
  ).bind(JSON.stringify(g.playerCards), JSON.stringify(g.deck), Date.now(), user.id).first();
  if (!upd) throw new HttpError(409, "Partie déjà terminée");

  const curUser = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(user.id).first();
  return json({
    active: true,
    bet: g.bet,
    player: { cards: g.playerCards, score: pScore },
    dealer: { cards: [g.dealerCards[0], "?"], score: handValue([g.dealerCards[0]]) },
    canDouble: false,
    status: "playing",
    balance: curUser.balance,
  });
}

async function bjStand(db, user) {
  const g = await getBjGame(db, user.id);
  if (!g || g.status !== "playing") throw new HttpError(400, "Aucune partie en cours");
  return await resolveDealer(db, user, g);
}

async function bjDouble(db, user) {
  // Verrou exclusif : une seule requête peut faire passer la partie de "playing" à "doubling"
  const claim = await db.prepare(
    "UPDATE blackjack_games SET status = 'doubling', updated = ? WHERE user_id = ? AND status = 'playing' RETURNING user_id"
  ).bind(Date.now(), user.id).first();
  if (!claim) throw new HttpError(400, "Aucune partie en cours");

  const revert = () =>
    db.prepare("UPDATE blackjack_games SET status = 'playing' WHERE user_id = ? AND status = 'doubling'").bind(user.id).run();

  const g = await getBjGame(db, user.id);
  if (g.playerCards.length !== 2) {
    await revert();
    throw new HttpError(400, "Doubler n'est permis qu'au premier tour");
  }

  const userRow = await db.prepare(
    "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(g.bet, user.id, g.bet).first();
  if (!userRow) {
    await revert();
    throw new HttpError(400, "Solde insuffisant pour doubler");
  }

  g.bet = g.bet * 2;
  g.playerCards.push(g.deck.pop());
  const pScore = handValue(g.playerCards);

  if (pScore > 21) {
    const balance = await settle(db, "blackjack_games", user.id, 0, "doubling");
    return json({
      active: false,
      bet: g.bet,
      player: { cards: g.playerCards, score: pScore },
      dealer: { cards: g.dealerCards, score: handValue(g.dealerCards) },
      status: "bust",
      payout: 0,
      delta: -g.bet,
      balance,
    });
  }

  return await resolveDealer(db, user, g, "doubling");
}

// ---------- Mines Logic ----------
function nCr(n, r) {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  let res = 1;
  for (let i = 1; i <= r; i++) res = (res * (n - i + 1)) / i;
  return res;
}

function getMinesMultiplier(minesCount, diamondsCount) {
  if (diamondsCount === 0) return 1;
  const totalSafe = 25 - minesCount;
  if (diamondsCount > totalSafe) return 0;
  const prob = nCr(totalSafe, diamondsCount) / nCr(25, diamondsCount);
  const mult = (1 / prob) * 0.97; // 97% RTP
  return Math.round(mult * 100) / 100;
}

async function getMinesGame(db, userId) {
  const row = await db.prepare("SELECT * FROM mines_games WHERE user_id = ?").bind(userId).first();
  if (!row) return null;
  return {
    ...row,
    mineIndices: JSON.parse(row.mine_indices),
    revealedRaw: row.revealed, // texte exact en base, utilisé pour les mises à jour conditionnelles
    revealed: JSON.parse(row.revealed),
  };
}

async function minesState(db, user) {
  await purgeStale(db, "mines_games", user.id);
  const g = await getMinesGame(db, user.id);
  if (!g) return json({ active: false });
  const mult = getMinesMultiplier(g.mines_count, g.revealed.length);
  const nextMult = getMinesMultiplier(g.mines_count, g.revealed.length + 1);
  return json({
    active: true,
    bet: g.bet,
    minesCount: g.mines_count,
    revealed: g.revealed,
    mult,
    nextMult,
    cashout: Math.floor(g.bet * mult),
  });
}

async function minesStart(req, db, user) {
  const { bet, minesCount } = await readBody(req);
  if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) throw new HttpError(400, `Mise entre 1 et ${MAX_BET}`);
  const mCount = Math.floor(Number(minesCount));
  if (!Number.isInteger(mCount) || mCount < 1 || mCount > 24) throw new HttpError(400, "Nombre de mines entre 1 et 24");

  await purgeStale(db, "mines_games", user.id);
  if (await getMinesGame(db, user.id)) throw new HttpError(400, "Une partie de Mines est déjà en cours");

  const allPos = Array.from({ length: 25 }, (_, i) => i);
  for (let i = allPos.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [allPos[i], allPos[j]] = [allPos[j], allPos[i]];
  }
  const mines = allPos.slice(0, mCount);

  // Création de la partie d'abord (clé primaire = une seule partie), puis débit de la mise
  try {
    await db.prepare(
      "INSERT INTO mines_games (user_id, bet, mines_count, mine_indices, revealed, updated) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(user.id, bet, mCount, JSON.stringify(mines), "[]", Date.now()).run();
  } catch (e) {
    if (String(e.message || e).includes("UNIQUE")) throw new HttpError(400, "Une partie de Mines est déjà en cours");
    throw e;
  }
  const userRow = await db.prepare(
    "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(bet, user.id, bet).first();
  if (!userRow) {
    await db.prepare("DELETE FROM mines_games WHERE user_id = ?").bind(user.id).run();
    throw new HttpError(400, "Solde insuffisant");
  }

  return json({
    active: true,
    bet,
    minesCount: mCount,
    revealed: [],
    mult: 1,
    nextMult: getMinesMultiplier(mCount, 1),
    cashout: 0,
    balance: userRow.balance,
  });
}

async function minesReveal(req, db, user) {
  const { index } = await readBody(req);
  const idx = Math.floor(Number(index));
  if (!Number.isInteger(idx) || idx < 0 || idx > 24) throw new HttpError(400, "Case invalide");

  const g = await getMinesGame(db, user.id);
  if (!g) throw new HttpError(400, "Aucune partie de Mines en cours");
  if (g.revealed.includes(idx)) throw new HttpError(400, "Case déjà révélée");

  if (g.mineIndices.includes(idx)) {
    const balance = await forfeit(db, "mines_games", user.id);
    return json({
      bomb: true,
      hitIndex: idx,
      mines: g.mineIndices,
      revealed: g.revealed,
      delta: -g.bet,
      payout: 0,
      balance,
    });
  }

  g.revealed.push(idx);
  const safeLeft = 25 - g.mines_count - g.revealed.length;
  const mult = getMinesMultiplier(g.mines_count, g.revealed.length);

  if (safeLeft === 0) {
    const payout = Math.floor(g.bet * mult);
    const balance = await settle(db, "mines_games", user.id, payout, null, " AND revealed = ?", [g.revealedRaw]);
    return json({
      bomb: false,
      allCleared: true,
      revealed: g.revealed,
      mines: g.mineIndices,
      mult,
      payout,
      delta: payout - g.bet,
      balance,
    });
  }

  // Mise à jour conditionnelle : échoue si une autre requête a modifié la partie entre-temps
  const upd = await db.prepare(
    "UPDATE mines_games SET revealed = ?, updated = ? WHERE user_id = ? AND revealed = ? RETURNING user_id"
  ).bind(JSON.stringify(g.revealed), Date.now(), user.id, g.revealedRaw).first();
  if (!upd) throw new HttpError(409, "Action simultanée détectée, réessaie");

  const curUser = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(user.id).first();
  return json({
    bomb: false,
    revealed: g.revealed,
    mult,
    nextMult: getMinesMultiplier(g.mines_count, g.revealed.length + 1),
    cashout: Math.floor(g.bet * mult),
    balance: curUser.balance,
  });
}

async function minesCashout(db, user) {
  const g = await getMinesGame(db, user.id);
  if (!g) throw new HttpError(400, "Aucune partie en cours");
  if (g.revealed.length === 0) throw new HttpError(400, "Révèle au moins un diamant avant d'encaisser");

  const mult = getMinesMultiplier(g.mines_count, g.revealed.length);
  const payout = Math.floor(g.bet * mult);
  const balance = await settle(db, "mines_games", user.id, payout, null, " AND revealed = ?", [g.revealedRaw]);

  return json({
    payout,
    delta: payout - g.bet,
    mult,
    mines: g.mineIndices,
    revealed: g.revealed,
    balance,
  });
}

// ---------- Utilitaires Utilisateur & Session ----------
async function readBody(req) {
  try {
    const text = await req.text();
    if (text.length > 4096) throw 0;
    const d = JSON.parse(text || "{}");
    if (d === null || typeof d !== "object") throw 0;
    return d;
  } catch {
    throw new HttpError(400, "Requête JSON invalide");
  }
}

async function createSession(db, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires < ?").bind(userId, now).run();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, now + SESSION_MS).run();
  return token;
}

async function authenticate(req, db) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("authorization") || "");
  if (!m) throw new HttpError(401, "Non connecté");
  const row = await db.prepare(
    "SELECT u.id, u.name, u.balance, u.last_daily FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?"
  ).bind(await sha256Hex(m[1]), Date.now()).first();
  if (!row) throw new HttpError(401, "Session expirée");
  return { row, tokenHash: await sha256Hex(m[1]) };
}

const publicUser = (u) => ({ name: u.name, balance: u.balance, nextDaily: Math.max(0, u.last_daily + DAILY_MS) });

// ---------- Routes Compte ----------
async function register(req, db) {
  const { name, password } = await readBody(req);
  if (typeof name !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new HttpError(400, "Pseudo : 3 à 16 caractères (lettres, chiffres, _)");
  if (typeof password !== "string" || password.length < 6 || password.length > 100) throw new HttpError(400, "Mot de passe : 6 caractères minimum");

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  await db.prepare("DELETE FROM reg_ip WHERE ts < ?").bind(now - 3600 * 1000).run();
  const c = await db.prepare("SELECT COUNT(*) AS n FROM reg_ip WHERE ip = ? AND ts > ?").bind(ip, now - 3600 * 1000).first();
  if (c.n >= MAX_REG_PER_IP_HOUR) throw new HttpError(429, "Trop de comptes créés depuis cette IP, réessaie plus tard");

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  let row;
  try {
    row = await db.prepare(
      "INSERT INTO users (name, name_lower, salt, hash, balance, created) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, balance, last_daily"
    ).bind(name, name.toLowerCase(), salt, hash, START_BALANCE, now).first();
  } catch (e) {
    if (String(e.message || e).includes("UNIQUE")) throw new HttpError(409, "Ce pseudo est déjà pris");
    throw e;
  }
  await db.prepare("INSERT INTO reg_ip (ip, ts) VALUES (?, ?)").bind(ip, now).run();
  return json({ token: await createSession(db, row.id), user: publicUser(row) });
}

async function login(req, db) {
  const { name, password } = await readBody(req);
  if (typeof name !== "string" || typeof password !== "string" || name.length > 32 || password.length > 100) throw new HttpError(400, "Requête invalide");
  const nameLower = name.toLowerCase();
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const u = await db.prepare("SELECT * FROM users WHERE name_lower = ?").bind(nameLower).first();
  const now = Date.now();

  // Verrou par (IP + pseudo) : un tiers ne peut pas bloquer le compte d'un autre depuis son IP
  const f = u ? await db.prepare("SELECT fails, lock_until FROM login_fails WHERE ip = ? AND name_lower = ?").bind(ip, nameLower).first() : null;
  if (f && f.lock_until > now) throw new HttpError(429, "Trop d'essais infructueux, attends un peu", { wait: f.lock_until - now });
  if (u && u.lock_until > now) throw new HttpError(429, "Compte temporairement verrouillé, réessaie plus tard", { wait: u.lock_until - now });

  const hash = await hashPassword(password, u ? u.salt : "00".repeat(16));
  if (!u || !safeEqual(hash, u.hash)) {
    if (u) {
      await db.prepare(
        `INSERT INTO login_fails (ip, name_lower, fails, lock_until) VALUES (?, ?, 1, 0)
         ON CONFLICT(ip, name_lower) DO UPDATE SET
           fails = CASE WHEN fails + 1 >= ? THEN 0 ELSE fails + 1 END,
           lock_until = CASE WHEN fails + 1 >= ? THEN ? ELSE 0 END`
      ).bind(ip, nameLower, MAX_FAILS, MAX_FAILS, now + LOCK_MS).run();
      const lock = u.fails + 1 >= ACCOUNT_MAX_FAILS;
      await db.prepare("UPDATE users SET fails = ?, lock_until = ? WHERE id = ?")
        .bind(lock ? 0 : u.fails + 1, lock ? now + ACCOUNT_LOCK_MS : 0, u.id).run();
    }
    throw new HttpError(401, "Pseudo ou mot de passe incorrect");
  }
  await db.batch([
    db.prepare("UPDATE users SET fails = 0, lock_until = 0 WHERE id = ?").bind(u.id),
    db.prepare("DELETE FROM login_fails WHERE ip = ? AND name_lower = ?").bind(ip, nameLower),
  ]);
  return json({ token: await createSession(db, u.id), user: publicUser(u) });
}

async function play(req, db, user) {
  const { game, bet, choice } = await readBody(req);
  if (!Object.hasOwn(GAMES, game)) throw new HttpError(400, "Jeu inconnu");
  if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) throw new HttpError(400, `Mise entre 1 et ${MAX_BET}`);
  const { result, mult } = GAMES[game](choice);
  const payout = Math.floor(bet * mult);

  const row = await db.prepare(
    "UPDATE users SET balance = balance + ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(payout - bet, user.id, bet).first();
  if (!row) throw new HttpError(400, "Solde insuffisant");
  return json({ game, bet, result, mult, payout, delta: payout - bet, balance: row.balance });
}

async function daily(db, user) {
  const now = Date.now();
  const row = await db.prepare(
    "UPDATE users SET balance = balance + ?, last_daily = ? WHERE id = ? AND last_daily <= ? RETURNING balance, last_daily"
  ).bind(DAILY_BONUS, now, user.id, now - DAILY_MS).first();
  if (!row) {
    const u = await db.prepare("SELECT last_daily FROM users WHERE id = ?").bind(user.id).first();
    throw new HttpError(429, "Bonus déjà récupéré aujourd'hui", { wait: u.last_daily + DAILY_MS - now });
  }
  return json({ balance: row.balance, bonus: DAILY_BONUS, nextDaily: row.last_daily + DAILY_MS });
}

// ---------- Système de suggestions de sites (Discord Webhook & Actions) ----------
const MAX_SUGGEST_PER_HOUR = 5;

async function suggestSite(req, db, env) {
  const ip = req.headers.get("cf-connecting-ip") || "0.0.0.0";
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;

  // Rate-limiting par IP (max 5 suggestions par heure)
  const { results: recent } = await db.prepare(
    "SELECT count(*) as cnt FROM site_suggestions WHERE ip = ? AND created > ?"
  ).bind(ip, oneHourAgo).all();
  if (recent && recent[0] && recent[0].cnt >= MAX_SUGGEST_PER_HOUR) {
    throw new HttpError(429, "Trop de suggestions envoyées récemment. Réessaie dans une heure.");
  }

  const body = await req.json().catch(() => null);
  if (!body) throw new HttpError(400, "Corps de requête invalide.");

  const name = (body.name || "").trim();
  let url = (body.url || "").trim();
  const folder = (body.folder || "Jeux").trim();
  const author = (body.author || "").trim().slice(0, 40);
  const notes = (body.notes || "").trim().slice(0, 400);

  if (!name || name.length > 60) throw new HttpError(400, "Le nom du site doit contenir entre 1 et 60 caractères.");
  if (!url) throw new HttpError(400, "L'URL est requise.");
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    const parsed = new URL(url);
    if (!/\.[a-z]{2,}$/i.test(parsed.hostname) && parsed.hostname !== "localhost") {
      throw new Error();
    }
  } catch {
    throw new HttpError(400, "L'URL fournie est invalide.");
  }

  // Vérifier si le site a déjà été proposé
  const existing = await db.prepare(
    "SELECT id, status FROM site_suggestions WHERE url = ? AND status != 'rejected' LIMIT 1"
  ).bind(url).first();
  if (existing) {
    if (existing.status === "approved") {
      throw new HttpError(400, "Ce site est déjà validé et accepté dans FloatFrame !");
    }
    throw new HttpError(400, "Ce site a déjà été proposé et est en cours d'examen par l'administrateur.");
  }

  const actionToken = randomHex(24);

  const ins = await db.prepare(
    "INSERT INTO site_suggestions (name, url, folder, author, notes, status, action_token, ip, created) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)"
  ).bind(name, url, folder, author || null, notes || null, actionToken, ip, now).run();

  const id = ins.meta?.last_row_id || ins.lastRowId || (await db.prepare("SELECT last_insert_rowid() AS id").first())?.id;

  // Envoi sécurisé via Webhook Discord (depuis le serveur Cloudflare, invisible pour le client)
  let discordSent = false;
  let discordError = null;

  if (env.DISCORD_WEBHOOK_URL) {
    const workerOrigin = new URL(req.url).origin;
    const approveUrl = `${workerOrigin}/api/suggest/action?id=${id}&token=${actionToken}&action=approve`;
    const rejectUrl = `${workerOrigin}/api/suggest/action?id=${id}&token=${actionToken}&action=reject`;

    const discordPayload = {
      username: "FloatFrame · Modération",
      embeds: [
        {
          title: "💡 Nouvelle proposition de site !",
          color: 0x7c5cff,
          description: "Un utilisateur a demandé l'ajout d'un nouveau site dans le hub FloatFrame.",
          fields: [
            { name: "🎮 Nom du site", value: `**${name}**`, inline: true },
            { name: "📁 Dossier suggéré", value: folder, inline: true },
            { name: "👤 Proposé par", value: author ? `\`${author}\`` : "*Anonyme*", inline: true },
            { name: "🔗 URL", value: url, inline: false },
            { name: "📝 Commentaire / Raison", value: notes ? `> ${notes}` : "*Aucun*", inline: false },
            {
              name: "⚡ Décision Administrateur",
              value: `👉 **[✅ ACCEPTER CE SITE](${approveUrl})**\n👉 **[❌ REFUSER LA DEMANDE](${rejectUrl})**`,
              inline: false,
            },
          ],
          footer: { text: `Demande #${id} · FloatFrame Cloudflare Bot` },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const dRes = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "FloatFrame-Cloudflare-Worker/1.0",
        },
        body: JSON.stringify(discordPayload),
      });
      if (dRes.ok) {
        discordSent = true;
      } else {
        discordError = `Discord a répondu HTTP ${dRes.status}: ` + (await dRes.text());
        console.error("Erreur webhook Discord:", discordError);
      }
    } catch (e) {
      discordError = e.message || String(e);
      console.error("Erreur envoi webhook Discord:", e);
    }
  } else {
    console.warn("DISCORD_WEBHOOK_URL n'est pas configuré dans Cloudflare.");
  }

  return json({
    ok: true,
    id,
    discordSent,
    discordConfigured: !!env.DISCORD_WEBHOOK_URL,
    errorDetail: discordError,
    message: discordSent
      ? "Demande envoyée avec succès ! L'administrateur a été notifié sur Discord."
      : !env.DISCORD_WEBHOOK_URL
      ? "Demande enregistrée en base ! Attention : la variable DISCORD_WEBHOOK_URL n'a pas encore été configurée dans Cloudflare."
      : "Demande enregistrée en base, mais Discord a retourné une erreur lors de l'envoi.",
  });
}

async function actionSuggest(req, db, env) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  const token = searchParams.get("token") || "";
  const action = (searchParams.get("action") || "").toLowerCase();

  if (!id || !token || (action !== "approve" && action !== "reject")) {
    return html(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Erreur</title>
      <style>body{background:#0f111a;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0}
      .c{background:#171a27;padding:30px;border-radius:14px;border:1px solid rgba(255,255,255,.1);text-align:center}</style></head>
      <body><div class="c"><h2>Paramètres invalides</h2><p>Le lien d'action est incomplet ou erroné.</p></div></body></html>
    `, 400);
  }

  const item = await db.prepare(
    "SELECT * FROM site_suggestions WHERE id = ? AND action_token = ?"
  ).bind(id, token).first();

  if (!item) {
    return html(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Introuvable</title>
      <style>body{background:#0f111a;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0}
      .c{background:#171a27;padding:30px;border-radius:14px;border:1px solid rgba(255,255,255,.1);text-align:center}</style></head>
      <body><div class="c"><h2>Demande introuvable</h2><p>Cette suggestion n'existe pas ou le token de sécurité est invalide.</p></div></body></html>
    `, 404);
  }

  if (item.status !== "pending") {
    const statusFr = item.status === "approved" ? "acceptée" : "refusée";
    return html(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Déjà traitée</title>
      <style>body{background:#0f111a;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0}
      .c{background:#171a27;padding:30px;border-radius:14px;border:1px solid rgba(255,255,255,.1);text-align:center;max-width:400px}</style></head>
      <body><div class="c"><h2>Déjà traitée</h2><p>Cette demande pour <b>${item.name}</b> a déjà été <b>${statusFr}</b>.</p></div></body></html>
    `, 200);
  }

  const now = Date.now();

  if (action === "approve") {
    await db.prepare(
      "UPDATE site_suggestions SET status = 'approved', reviewed_at = ? WHERE id = ?"
    ).bind(now, id).run();

    // Notifier Discord
    if (env.DISCORD_WEBHOOK_URL) {
      try {
        await fetch(env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "FloatFrame · Modération",
            embeds: [
              {
                title: "✅ Site accepté et validé !",
                color: 0x3ddc97,
                description: `La proposition pour **${item.name}** a été acceptée par l'administrateur.`,
                fields: [
                  { name: "📁 Dossier", value: item.folder, inline: true },
                  { name: "🔗 URL", value: item.url, inline: true },
                  { name: "👤 Proposé par", value: item.author || "*Anonyme*", inline: true },
                ],
                footer: { text: `Demande #${item.id} approuvée` },
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch (e) {
        console.error("Erreur notification Discord:", e);
      }
    }

    const jsonSnippet = JSON.stringify({ name: item.name, url: item.url, folder: item.folder }, null, 2);

    return html(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>Site validé ! - FloatFrame</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0f111a;color:#eef0f8;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
          .card{background:#171a27;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:28px;max-width:480px;width:100%;box-shadow:0 30px 70px rgba(0,0,0,.6);text-align:center}
          .badge{display:inline-block;background:rgba(61,220,151,.15);color:#3ddc97;border:1px solid rgba(61,220,151,.4);padding:5px 14px;border-radius:999px;font-weight:600;font-size:12.5px;margin-bottom:16px}
          h1{margin:0 0 8px;font-size:22px;letter-spacing:-.3px}
          p{color:#8b90a8;font-size:13.5px;margin:0 0 20px;line-height:1.5}
          .info{background:rgba(0,0,0,.35);border-radius:12px;padding:14px 16px;text-align:left;margin-bottom:18px;font-size:13px;border:1px solid rgba(255,255,255,.05)}
          .info div{margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .info b{color:#fff}
          .json-box{background:#090a10;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;font-family:monospace;font-size:12px;text-align:left;white-space:pre-wrap;word-break:break-all;color:#b9a8ff;margin-bottom:16px}
          .btn{background:linear-gradient(135deg,#7c5cff,#00d4ff);color:#fff;border:0;padding:11px 22px;border-radius:10px;font-weight:650;font-size:13px;cursor:pointer;transition:.15s}
          .btn:hover{filter:brightness(1.15);transform:scale(1.02)}
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✓ Site approuvé avec succès</div>
          <h1>${item.name}</h1>
          <p>Le site a été validé et enregistré dans la base de données FloatFrame.</p>
          <div class="info">
            <div><b>📁 Dossier :</b> ${item.folder}</div>
            <div><b>🔗 Lien :</b> <a href="${item.url}" target="_blank" style="color:#00d4ff">${item.url}</a></div>
            ${item.author ? `<div><b>👤 Proposé par :</b> ${item.author}</div>` : ""}
          </div>
          <div class="json-box" id="jsonSnippet">${jsonSnippet}</div>
          <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('jsonSnippet').textContent); alert('Snippet JSON copié !');">📋 Copier le snippet JSON</button>
        </div>
      </body>
      </html>
    `, 200);
  }

  // Refus
  await db.prepare(
    "UPDATE site_suggestions SET status = 'rejected', reviewed_at = ? WHERE id = ?"
  ).bind(now, id).run();

  if (env.DISCORD_WEBHOOK_URL) {
    try {
      await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "FloatFrame · Modération",
          embeds: [
            {
              title: "❌ Demande de site refusée",
              color: 0xff4d63,
              description: `La proposition pour **${item.name}** a été refusée par l'administrateur.`,
              footer: { text: `Demande #${item.id} refusée` },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    } catch (e) {
      console.error("Erreur notification Discord:", e);
    }
  }

  return html(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <title>Demande Refusée - FloatFrame</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0f111a;color:#eef0f8;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
        .card{background:#171a27;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:28px;max-width:420px;width:100%;box-shadow:0 30px 70px rgba(0,0,0,.6);text-align:center}
        .badge{display:inline-block;background:rgba(255,77,99,.15);color:#ff4d63;border:1px solid rgba(255,77,99,.4);padding:5px 14px;border-radius:999px;font-weight:600;font-size:12.5px;margin-bottom:16px}
        h1{margin:0 0 8px;font-size:22px}
        p{color:#8b90a8;font-size:13.5px;margin:0;line-height:1.5}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">✕ Demande rejetée</div>
        <h1>${item.name}</h1>
        <p>Cette proposition a été refusée et ne sera pas ajoutée au hub.</p>
      </div>
    </body>
    </html>
  `, 200);
}

async function listApprovedSites(db) {
  const { results } = await db.prepare(
    "SELECT id, name, url, folder, created FROM site_suggestions WHERE status = 'approved' ORDER BY id ASC"
  ).all();
  return json({ approved: results || [] });
}

// ---------- Dispatcher HTTP ----------
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(req.url);
    const db = env.DB;

    try {
      await ensureTables(db);
      if (req.method === "GET" && pathname === "/api/leaderboard") {
        const { results } = await db.prepare("SELECT name, balance FROM users ORDER BY balance DESC LIMIT 10").all();
        return json({ top: results });
      }
      if (req.method === "POST" && pathname === "/api/register") return await register(req, db);
      if (req.method === "POST" && pathname === "/api/login") return await login(req, db);

      // Suggestions de sites & modération Discord
      if (req.method === "POST" && pathname === "/api/suggest") return await suggestSite(req, db, env);
      if (req.method === "GET" && pathname === "/api/suggest/action") return await actionSuggest(req, db, env);
      if (req.method === "GET" && pathname === "/api/suggest/approved") return await listApprovedSites(db);

      // Routes protégées par authentification
      const isAuthRoute =
        pathname === "/api/me" ||
        pathname === "/api/play" ||
        pathname === "/api/daily" ||
        pathname === "/api/logout" ||
        pathname.startsWith("/api/blackjack/") ||
        pathname.startsWith("/api/mines/");

      if (isAuthRoute) {
        const { row, tokenHash } = await authenticate(req, db);

        if (req.method === "GET" && pathname === "/api/me") return json({ user: publicUser(row) });
        if (req.method === "POST" && pathname === "/api/play") return await play(req, db, row);
        if (req.method === "POST" && pathname === "/api/daily") return await daily(db, row);
        if (req.method === "POST" && pathname === "/api/logout") {
          await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
          return json({ ok: true });
        }

        // Blackjack
        if (pathname.startsWith("/api/blackjack/")) {
          if (req.method === "GET" && pathname === "/api/blackjack/state") return await bjState(db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/deal") return await bjDeal(req, db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/hit") return await bjHit(db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/stand") return await bjStand(db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/double") return await bjDouble(db, row);
        }

        // Mines
        if (pathname.startsWith("/api/mines/")) {
          if (req.method === "GET" && pathname === "/api/mines/state") return await minesState(db, row);
          if (req.method === "POST" && pathname === "/api/mines/start") return await minesStart(req, db, row);
          if (req.method === "POST" && pathname === "/api/mines/reveal") return await minesReveal(req, db, row);
          if (req.method === "POST" && pathname === "/api/mines/cashout") return await minesCashout(db, row);
        }
      }

      throw new HttpError(404, "Route introuvable");
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      return json({ error: "Erreur serveur : " + (e.message || e) }, 500);
    }
  },
};
