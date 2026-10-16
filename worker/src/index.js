// FloatFrame Casino : serveur (Cloudflare Worker + D1)
// Toute la logique (comptes, soldes, tirages) est ici. Le client ne décide jamais d'un gain.

const START_BALANCE = 1000;
const DAILY_BONUS = 500;
const DAILY_MS = 24 * 3600 * 1000;
const MAX_BET = 50000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const PBKDF2_ITER = 100000; // maximum autorisé par Workers
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
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// ---------- Crypto ----------
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITER }, key, 256);
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

// ---------- Jeux (renvoient result + mult ; payout = floor(mise * mult)) ----------
const SLOT_PAYS = [7, 24, 14, 9, 40]; // multiplicateurs des 3 symboles identiques (🍒 🍋 🔔 ⭐ 7)
const SLOT_PAIR = 0.4;                // deux symboles identiques
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
    let win;
    if (t === "number") {
      if (!Number.isInteger(choice.number) || choice.number < 0 || choice.number > 36) throw new HttpError(400, "Numéro invalide");
      return { result: { number: n, color }, mult: n === choice.number ? 36 : 0 };
    }
    if (n === 0) win = false;
    else if (t === "red") win = color === "red";
    else if (t === "black") win = color === "black";
    else if (t === "even") win = n % 2 === 0;
    else if (t === "odd") win = n % 2 === 1;
    else if (t === "low") win = n <= 18;
    else if (t === "high") win = n >= 19;
    else throw new HttpError(400, "Choix invalide");
    return { result: { number: n, color }, mult: win ? 2 : 0 };
  },
};

// ---------- Utilitaires ----------
async function readBody(req) {
  try {
    const text = await req.text();
    if (text.length > 2048) throw 0;
    const d = JSON.parse(text || "{}");
    if (d === null || typeof d !== "object") throw 0;
    return d;
  } catch { throw new HttpError(400, "Requête invalide"); }
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

// ---------- Routes ----------
async function register(req, db) {
  const { name, password } = await readBody(req);
  if (typeof name !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new HttpError(400, "Pseudo : 3 à 16 caractères (lettres, chiffres, _)");
  if (typeof password !== "string" || password.length < 6 || password.length > 100) throw new HttpError(400, "Mot de passe : 6 caractères minimum");

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  await db.prepare("DELETE FROM reg_ip WHERE ts < ?").bind(now - 3600 * 1000).run();
  const c = await db.prepare("SELECT COUNT(*) AS n FROM reg_ip WHERE ip = ? AND ts > ?").bind(ip, now - 3600 * 1000).first();
  if (c.n >= MAX_REG_PER_IP_HOUR) throw new HttpError(429, "Trop de comptes créés, réessaie plus tard");

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
  if (u && u.lock_until > now) throw new HttpError(429, "Trop d'essais, attends un peu", { wait: u.lock_until - now });
  // On hache toujours, même si le compte n'existe pas (temps de réponse identique)
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
  // Un seul UPDATE atomique : vérifie le solde ET applique le gain/la perte.
  // Des requêtes parallèles ne peuvent donc pas dépenser deux fois le même argent.
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
    throw new HttpError(429, "Bonus déjà récupéré", { wait: u.last_daily + DAILY_MS - now });
  }
  return json({ balance: row.balance, bonus: DAILY_BONUS, nextDaily: row.last_daily + DAILY_MS });
}

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

      if (pathname === "/api/me" || pathname === "/api/play" || pathname === "/api/daily" || pathname === "/api/logout") {
        const { row, tokenHash } = await authenticate(req, db);
        if (req.method === "GET" && pathname === "/api/me") return json({ user: publicUser(row) });
        if (req.method === "POST" && pathname === "/api/play") return await play(req, db, row);
        if (req.method === "POST" && pathname === "/api/daily") return await daily(db, row);
        if (req.method === "POST" && pathname === "/api/logout") {
          await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
          return json({ ok: true });
        }
      }
      throw new HttpError(404, "Introuvable");
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      return json({ error: "Erreur serveur" }, 500);
    }
  },
};
