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
  const g = await getBjGame(db, user.id);
  if (!g) return json({ active: false });
  return json({
    active: true,
    bet: g.bet,
    player: { cards: g.playerCards, score: handValue(g.playerCards) },
    dealer: { cards: [g.dealerCards[0], "?"], score: handValue([g.dealerCards[0]]) },
    canDouble: g.playerCards.length === 2 && user.balance >= g.bet,
    status: g.status,
  });
}

async function bjDeal(req, db, user) {
  const { bet } = await readBody(req);
  if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) throw new HttpError(400, `Mise entre 1 et ${MAX_BET}`);

  const existing = await getBjGame(db, user.id);
  if (existing) throw new HttpError(400, "Une partie de Blackjack est déjà en cours. Termine-la d'abord !");

  const userRow = await db.prepare(
    "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(bet, user.id, bet).first();
  if (!userRow) throw new HttpError(400, "Solde insuffisant");

  const deck = createDeck();
  const playerCards = [deck.pop(), deck.pop()];
  const dealerCards = [deck.pop(), deck.pop()];

  const pScore = handValue(playerCards);
  const pBJ = isNaturalBJ(playerCards);
  const dBJ = isNaturalBJ(dealerCards);

  if (pBJ) {
    let payout = 0;
    let status = "blackjack";
    let delta = 0;
    if (dBJ) {
      status = "push";
      payout = bet;
      delta = 0;
    } else {
      payout = bet + Math.floor(bet * 1.5);
      delta = Math.floor(bet * 1.5);
    }
    const endRow = await db.prepare(
      "UPDATE users SET balance = balance + ? WHERE id = ? RETURNING balance"
    ).bind(payout, user.id).first();

    return json({
      active: false,
      bet,
      player: { cards: playerCards, score: pScore },
      dealer: { cards: dealerCards, score: handValue(dealerCards) },
      status,
      payout,
      delta,
      balance: endRow.balance,
    });
  }

  if (dBJ) {
    return json({
      active: false,
      bet,
      player: { cards: playerCards, score: pScore },
      dealer: { cards: dealerCards, score: 21 },
      status: "dealer_blackjack",
      payout: 0,
      delta: -bet,
      balance: userRow.balance,
    });
  }

  const now = Date.now();
  await db.prepare(
    "INSERT INTO blackjack_games (user_id, bet, player_cards, dealer_cards, deck, status, updated) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(user.id, bet, JSON.stringify(playerCards), JSON.stringify(dealerCards), JSON.stringify(deck), "playing", now).run();

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

async function resolveDealer(db, user, g) {
  let dScore = handValue(g.dealerCards);
  while (dScore < 17) {
    g.dealerCards.push(g.deck.pop());
    dScore = handValue(g.dealerCards);
  }

  const pScore = handValue(g.playerCards);
  let status = "lose";
  let payout = 0;
  let delta = -g.bet;

  if (dScore > 21) {
    status = "dealer_bust";
    payout = g.bet * 2;
    delta = g.bet;
  } else if (pScore > dScore) {
    status = "win";
    payout = g.bet * 2;
    delta = g.bet;
  } else if (pScore === dScore) {
    status = "push";
    payout = g.bet;
    delta = 0;
  } else {
    status = "lose";
    payout = 0;
    delta = -g.bet;
  }

  await db.prepare("DELETE FROM blackjack_games WHERE user_id = ?").bind(user.id).run();

  let finalBal = user.balance;
  if (payout > 0) {
    const endRow = await db.prepare(
      "UPDATE users SET balance = balance + ? WHERE id = ? RETURNING balance"
    ).bind(payout, user.id).first();
    finalBal = endRow.balance;
  } else {
    const curUser = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(user.id).first();
    finalBal = curUser.balance;
  }

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
  if (!g) throw new HttpError(400, "Aucune partie en cours");

  const newCard = g.deck.pop();
  g.playerCards.push(newCard);
  const pScore = handValue(g.playerCards);

  if (pScore > 21) {
    await db.prepare("DELETE FROM blackjack_games WHERE user_id = ?").bind(user.id).run();
    const curUser = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(user.id).first();
    return json({
      active: false,
      bet: g.bet,
      player: { cards: g.playerCards, score: pScore },
      dealer: { cards: g.dealerCards, score: handValue(g.dealerCards) },
      status: "bust",
      payout: 0,
      delta: -g.bet,
      balance: curUser.balance,
    });
  }

  if (pScore === 21) {
    return await resolveDealer(db, user, g);
  }

  await db.prepare(
    "UPDATE blackjack_games SET player_cards = ?, deck = ?, updated = ? WHERE user_id = ?"
  ).bind(JSON.stringify(g.playerCards), JSON.stringify(g.deck), Date.now(), user.id).run();

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
  if (!g) throw new HttpError(400, "Aucune partie en cours");
  return await resolveDealer(db, user, g);
}

async function bjDouble(db, user) {
  const g = await getBjGame(db, user.id);
  if (!g) throw new HttpError(400, "Aucune partie en cours");
  if (g.playerCards.length !== 2) throw new HttpError(400, "Doubler n'est permis qu'au premier tour");

  const userRow = await db.prepare(
    "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(g.bet, user.id, g.bet).first();
  if (!userRow) throw new HttpError(400, "Solde insuffisant pour doubler");

  g.bet = g.bet * 2;
  const newCard = g.deck.pop();
  g.playerCards.push(newCard);
  const pScore = handValue(g.playerCards);

  if (pScore > 21) {
    await db.prepare("DELETE FROM blackjack_games WHERE user_id = ?").bind(user.id).run();
    return json({
      active: false,
      bet: g.bet,
      player: { cards: g.playerCards, score: pScore },
      dealer: { cards: g.dealerCards, score: handValue(g.dealerCards) },
      status: "bust",
      payout: 0,
      delta: -g.bet,
      balance: userRow.balance,
    });
  }

  return await resolveDealer(db, user, g);
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
    revealed: JSON.parse(row.revealed),
  };
}

async function minesState(db, user) {
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

  const existing = await getMinesGame(db, user.id);
  if (existing) throw new HttpError(400, "Une partie de Mines est déjà en cours");

  const userRow = await db.prepare(
    "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING balance"
  ).bind(bet, user.id, bet).first();
  if (!userRow) throw new HttpError(400, "Solde insuffisant");

  const allPos = Array.from({ length: 25 }, (_, i) => i);
  for (let i = allPos.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [allPos[i], allPos[j]] = [allPos[j], allPos[i]];
  }
  const mines = allPos.slice(0, mCount);

  await db.prepare(
    "INSERT INTO mines_games (user_id, bet, mines_count, mine_indices, revealed, updated) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(user.id, bet, mCount, JSON.stringify(mines), "[]", Date.now()).run();

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
    // Bombe touchée
    await db.prepare("DELETE FROM mines_games WHERE user_id = ?").bind(user.id).run();
    const curUser = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(user.id).first();
    return json({
      bomb: true,
      hitIndex: idx,
      mines: g.mineIndices,
      revealed: g.revealed,
      delta: -g.bet,
      payout: 0,
      balance: curUser.balance,
    });
  }

  g.revealed.push(idx);
  const safeLeft = 25 - g.mines_count - g.revealed.length;
  const mult = getMinesMultiplier(g.mines_count, g.revealed.length);

  if (safeLeft === 0) {
    const payout = Math.floor(g.bet * mult);
    await db.prepare("DELETE FROM mines_games WHERE user_id = ?").bind(user.id).run();
    const endRow = await db.prepare(
      "UPDATE users SET balance = balance + ? WHERE id = ? RETURNING balance"
    ).bind(payout, user.id).first();
    return json({
      bomb: false,
      allCleared: true,
      revealed: g.revealed,
      mines: g.mineIndices,
      mult,
      payout,
      delta: payout - g.bet,
      balance: endRow.balance,
    });
  }

  await db.prepare(
    "UPDATE mines_games SET revealed = ?, updated = ? WHERE user_id = ?"
  ).bind(JSON.stringify(g.revealed), Date.now(), user.id).run();

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

  await db.prepare("DELETE FROM mines_games WHERE user_id = ?").bind(user.id).run();
  const endRow = await db.prepare(
    "UPDATE users SET balance = balance + ? WHERE id = ? RETURNING balance"
  ).bind(payout, user.id).first();

  return json({
    payout,
    delta: payout - g.bet,
    mult,
    mines: g.mineIndices,
    balance: endRow.balance,
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
  if (typeof name !== "string" || typeof password !== "string" || password.length > 100) throw new HttpError(400, "Requête invalide");
  const u = await db.prepare("SELECT * FROM users WHERE name_lower = ?").bind(name.toLowerCase()).first();
  const now = Date.now();
  if (u && u.lock_until > now) throw new HttpError(429, "Trop d'essais infructueux, attends un peu", { wait: u.lock_until - now });
  
  const hash = await hashPassword(password, u ? u.salt : "00".repeat(16));
  if (!u || !safeEqual(hash, u.hash)) {
    if (u) {
      const lock = u.fails + 1 >= MAX_FAILS;
      await db.prepare("UPDATE users SET fails = ?, lock_until = ? WHERE id = ?")
        .bind(lock ? 0 : u.fails + 1, lock ? now + LOCK_MS : 0, u.id).run();
    }
    throw new HttpError(401, "Pseudo ou mot de passe incorrect");
  }
  await db.prepare("UPDATE users SET fails = 0, lock_until = 0 WHERE id = ?").bind(u.id).run();
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

// ---------- Dispatcher HTTP ----------
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(req.url);
    const db = env.DB;

    try {
      if (req.method === "GET" && pathname === "/api/leaderboard") {
        const { results } = await db.prepare("SELECT name, balance FROM users ORDER BY balance DESC LIMIT 10").all();
        return json({ top: results });
      }
      if (req.method === "POST" && pathname === "/api/register") return await register(req, db);
      if (req.method === "POST" && pathname === "/api/login") return await login(req, db);

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
          await ensureTables(db);
          if (req.method === "GET" && pathname === "/api/blackjack/state") return await bjState(db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/deal") return await bjDeal(req, db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/hit") return await bjHit(db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/stand") return await bjStand(db, row);
          if (req.method === "POST" && pathname === "/api/blackjack/double") return await bjDouble(db, row);
        }

        // Mines
        if (pathname.startsWith("/api/mines/")) {
          await ensureTables(db);
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
