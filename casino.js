// FloatFrame Casino : interface. Chargé à la demande par floatframe.js (reçoit `ctx`).
// Aucune règle de jeu ici : le serveur tire les résultats et tient les soldes.
const API = "https://floatframe-casino.hug6314.workers.dev"; // <- URL de ton Worker Cloudflare

const { h, toast, pane } = ctx;
const TK = "__floatFrameCasinoToken";
const SYM = ["🍒", "🍋", "🔔", "⭐", "7️⃣"];
const fmt = (n) => Number(n).toLocaleString("fr-FR");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
try { token = localStorage.getItem(TK); } catch {}
let user = null;
let tab = "slots";
let bet = 100;
let busy = false;

const CSS = `
.cz{--gold:#ffc83d;--ok:#3ddc97;--bad:#ff5d73;padding:18px 20px 26px;min-height:100%;color:#eef0f8;font-size:13px}
.cz *{box-sizing:border-box}
.cz h2{margin:0;font-size:22px;font-weight:750;letter-spacing:-.3px}
.cz p{margin:4px 0 0;color:#8b90a8;font-size:12px}
.cz button{font:inherit;color:inherit}
.cz input{font:inherit;color:#eef0f8;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;outline:none;width:100%}
.cz input:focus{border-color:#7c5cff}
.cz-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;border-radius:11px;font-weight:650;cursor:pointer;
  background:linear-gradient(135deg,#7c5cff,#00d4ff);box-shadow:0 6px 18px rgba(124,92,255,.35);transition:.15s}
.cz-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
.cz-btn:disabled{opacity:.5;cursor:default;transform:none;filter:none}
.cz-btn.gold{background:linear-gradient(135deg,#ffc83d,#ff8a3d);color:#2a1a00;box-shadow:0 6px 18px rgba(255,170,60,.35)}
.cz-btn.ghost{background:rgba(255,255,255,.07);box-shadow:none}
.cz-auth{max-width:320px;margin:30px auto 0;display:flex;flex-direction:column;gap:10px;text-align:center}
.cz-logo{font-size:44px}
.cz-seg{display:flex;gap:6px;background:rgba(255,255,255,.05);padding:4px;border-radius:12px}
.cz-seg button{flex:1;padding:8px;border-radius:9px;cursor:pointer;color:#8b90a8}
.cz-seg button.on{background:rgba(124,92,255,.35);color:#fff}
.cz-msg{min-height:16px;color:var(--bad);font-size:12px}
.cz-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.cz-top .who{flex:1;min-width:120px}
.cz-bal{font-size:20px;color:var(--gold);font-variant-numeric:tabular-nums}
.cz-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.cz-tabs button{padding:8px 12px;border-radius:10px;cursor:pointer;background:rgba(255,255,255,.06);color:#c9cce0}
.cz-tabs button.on{background:rgba(124,92,255,.4);color:#fff}
.cz-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px;align-items:center}
.cz-bet{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;width:100%}
.cz-bet input{width:110px;text-align:center;font-weight:650}
.cz-bet button{padding:8px 10px;border-radius:9px;background:rgba(255,255,255,.08);cursor:pointer}
.cz-reels{display:flex;gap:10px}
.cz-reel{width:76px;height:84px;border-radius:14px;display:grid;place-items:center;font-size:44px;background:#0b0d16;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 0 18px rgba(0,0,0,.6)}
.cz-reel.spin{animation:czb .16s linear infinite}
@keyframes czb{50%{transform:translateY(3px)}}
.cz-res{min-height:22px;font-weight:700;font-size:15px;text-align:center}
.cz-res.win{color:var(--ok)}.cz-res.lose{color:var(--bad)}
.cz-opts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.cz-opts button{padding:9px 14px;border-radius:10px;cursor:pointer;background:rgba(255,255,255,.08);border:1px solid transparent}
.cz-opts button.on{border-color:#7c5cff;background:rgba(124,92,255,.3)}
.cz-opts .red{background:rgba(220,40,60,.45)}.cz-opts .black{background:rgba(0,0,0,.55)}
.cz-ball{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-size:32px;font-weight:800;background:#0b0d16;border:3px solid rgba(255,255,255,.15)}
.cz-ball.red{background:#c4223a}.cz-ball.black{background:#15161d}.cz-ball.green{background:#1b8a52}
.cz-coin{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:800;color:#2a1a00;background:radial-gradient(circle at 30% 30%,#ffe27a,#e0a31c);box-shadow:0 6px 18px rgba(255,170,60,.35)}
.cz-coin.spin{animation:czf .5s linear infinite}
@keyframes czf{to{transform:rotateY(360deg)}}
.cz-pays{font-size:11px;color:#8b90a8;text-align:center;line-height:1.6}
.cz-list{width:100%;display:flex;flex-direction:column;gap:6px}
.cz-row{display:flex;gap:10px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,.05)}
.cz-row.me{outline:1px solid #7c5cff}
.cz-row span:nth-child(2){flex:1}
.cz-row b{color:var(--gold);font-variant-numeric:tabular-nums}
.cz-note{font-size:11px;color:#8b90a8;margin-top:12px;text-align:center}
`;
const style = h("style", { text: CSS });

const shield = (el) => {
  ["keydown", "keyup", "keypress"].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation()));
  return el;
};
const mount = (...kids) => pane.replaceChildren(style, h("div", { class: "cz" }, ...kids));

async function api(path, body) {
  const opt = { method: body === undefined ? "GET" : "POST", headers: {} };
  if (token) opt.headers.authorization = "Bearer " + token;
  if (body !== undefined) { opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(API + path, opt); } catch { throw new Error("Serveur injoignable"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || "Erreur " + r.status); e.status = r.status; e.data = d; throw e; }
  return d;
}
const saveToken = (t) => { token = t; try { t ? localStorage.setItem(TK, t) : localStorage.removeItem(TK); } catch {} };
const waitText = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

// ---------- Connexion ----------
function authView(mode = "login") {
  const name = shield(h("input", { type: "text", placeholder: "Pseudo", maxlength: "16", autocomplete: "off", spellcheck: "false" }));
  const pw = shield(h("input", { type: "password", placeholder: "Mot de passe", autocomplete: "off" }));
  const msg = h("div", { class: "cz-msg" });
  const go = h("button", { class: "cz-btn", text: mode === "login" ? "Se connecter" : "Créer mon compte" });
  const submit = async () => {
    msg.textContent = ""; go.disabled = true;
    try {
      const d = await api(mode === "login" ? "/api/login" : "/api/register", { name: name.value.trim(), password: pw.value });
      saveToken(d.token); user = d.user; tab = "slots"; appView();
    } catch (e) {
      msg.textContent = e.data && e.data.wait ? `${e.message} (${Math.ceil(e.data.wait / 1000)} s)` : e.message;
    } finally { go.disabled = false; }
  };
  go.onclick = submit;
  pw.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  const seg = h("div", { class: "cz-seg" },
    h("button", { class: mode === "login" ? "on" : "", text: "Connexion", onclick: () => authView("login") }),
    h("button", { class: mode === "register" ? "on" : "", text: "Inscription", onclick: () => authView("register") }));
  mount(h("div", { class: "cz-auth" },
    h("div", { class: "cz-logo", text: "🎰" }), h("h2", { text: "FloatFrame Casino" }),
    h("p", { text: "Monnaie virtuelle uniquement · 1 000 🪙 offertes" }),
    seg, name, pw, msg, go,
    h("div", { class: "cz-note", text: "N'utilise pas un vrai mot de passe que tu as ailleurs." })));
}

// ---------- Application ----------
function appView() {
  const bal = h("b", { class: "cz-bal" });
  const setBal = (n) => { user.balance = n; bal.textContent = fmt(n) + " 🪙"; };
  setBal(user.balance);

  const daily = h("button", { class: "cz-btn gold", text: "🎁 Bonus du jour" });
  daily.onclick = async () => {
    try {
      const d = await api("/api/daily", {});
      setBal(d.balance); toast(`+${d.bonus} 🪙 !`);
    } catch (e) { toast(e.data && e.data.wait ? `Reviens dans ${waitText(e.data.wait)}` : e.message); }
  };
  const out = h("button", { class: "cz-btn ghost", text: "Déconnexion" });
  out.onclick = async () => { try { await api("/api/logout", {}); } catch {} saveToken(null); user = null; authView(); };

  const top = h("div", { class: "cz-top" },
    h("div", { class: "who" }, h("h2", { text: user.name }), bal), daily, out);

  const body = h("div", {});
  const names = [["slots", "🎰 Machine"], ["coin", "🪙 Pile ou face"], ["roulette", "🎡 Roulette"], ["top", "🏆 Classement"]];
  const tabs = h("div", { class: "cz-tabs" }, ...names.map(([id, label]) =>
    h("button", { class: id === tab ? "on" : "", text: label, onclick: () => { tab = id; appView(); } })));

  const betBox = () => {
    const inp = shield(h("input", { type: "number", min: "1", step: "1" }));
    inp.value = bet;
    inp.addEventListener("input", () => { bet = Math.floor(Number(inp.value)) || 0; });
    const set = (v) => { bet = Math.max(1, Math.min(50000, Math.floor(v))); inp.value = bet; };
    return h("div", { class: "cz-bet" },
      h("button", { text: "Min", onclick: () => set(10) }),
      h("button", { text: "½", onclick: () => set(bet / 2) }),
      inp,
      h("button", { text: "×2", onclick: () => set(bet * 2) }),
      h("button", { text: "Max", onclick: () => set(Math.min(user.balance, 50000)) }));
  };

  // Un tour : le serveur répond avec le résultat et le nouveau solde
  const play = async (btn, game, choice, spinStart, spinStop) => {
    if (busy) return;
    if (!Number.isInteger(bet) || bet < 1) { toast("Mise invalide"); return; }
    busy = true; btn.disabled = true; spinStart();
    try {
      const [d] = await Promise.all([api("/api/play", { game, bet, choice }), sleep(900)]);
      spinStop(d);
      setBal(d.balance);
      return d;
    } catch (e) { spinStop(null); toast(e.message); }
    finally { busy = false; btn.disabled = false; }
  };
  const verdict = (el, d) => {
    el.className = "cz-res " + (d.delta > 0 ? "win" : d.delta === 0 ? "" : "lose");
    el.textContent = d.delta > 0 ? `Gagné ! +${fmt(d.delta)} 🪙` : d.delta === 0 ? "Mise récupérée" : `Perdu −${fmt(-d.delta)} 🪙`;
  };

  if (tab === "slots") {
    const reels = [0, 1, 2].map(() => h("div", { class: "cz-reel", text: "🎰" }));
    const res = h("div", { class: "cz-res" });
    const btn = h("button", { class: "cz-btn", text: "Lancer" });
    let timer;
    btn.onclick = () => play(btn, "slots", null,
      () => { res.textContent = ""; res.className = "cz-res"; reels.forEach((r) => r.classList.add("spin"));
        timer = setInterval(() => reels.forEach((r) => (r.textContent = SYM[Math.floor(Math.random() * 5)])), 80); },
      (d) => { clearInterval(timer); reels.forEach((r) => r.classList.remove("spin"));
        if (d) { d.result.reels.forEach((s, i) => (reels[i].textContent = SYM[s])); verdict(res, d); } });
    body.append(h("div", { class: "cz-card" }, h("div", { class: "cz-reels" }, ...reels), res, betBox(), btn,
      h("div", { class: "cz-pays", text: "3 identiques : 🍒×7 · 🍋×24 · 🔔×14 · ⭐×9 · 7️⃣×40  —  2 identiques : ×0,4" })));
  }

  if (tab === "coin") {
    let side = "pile";
    const coin = h("div", { class: "cz-coin", text: "PILE" });
    const res = h("div", { class: "cz-res" });
    const opts = h("div", { class: "cz-opts" });
    const draw = () => opts.replaceChildren(...[["pile", "Pile"], ["face", "Face"]].map(([v, l]) =>
      h("button", { class: side === v ? "on" : "", text: l, onclick: () => { side = v; draw(); } })));
    draw();
    const btn = h("button", { class: "cz-btn", text: "Lancer la pièce" });
    btn.onclick = () => play(btn, "coin", { side },
      () => { res.textContent = ""; res.className = "cz-res"; coin.classList.add("spin"); },
      (d) => { coin.classList.remove("spin"); if (d) { coin.textContent = d.result.side.toUpperCase(); verdict(res, d); } });
    body.append(h("div", { class: "cz-card" }, coin, opts, res, betBox(), btn,
      h("div", { class: "cz-pays", text: "Bonne face : ×1,95" })));
  }

  if (tab === "roulette") {
    let choice = { type: "red" };
    const ball = h("div", { class: "cz-ball", text: "?" });
    const res = h("div", { class: "cz-res" });
    const opts = h("div", { class: "cz-opts" });
    const num = shield(h("input", { type: "number", min: "0", max: "36", placeholder: "N° 0-36", style: "width:96px" }));
    const kinds = [["red", "Rouge", "red"], ["black", "Noir", "black"], ["even", "Pair", ""], ["odd", "Impair", ""], ["low", "1–18", ""], ["high", "19–36", ""]];
    const draw = () => opts.replaceChildren(...kinds.map(([v, l, c]) =>
      h("button", { class: c + (choice.type === v ? " on" : ""), text: l, onclick: () => { choice = { type: v }; draw(); } })));
    draw();
    num.addEventListener("input", () => {
      if (num.value === "") { if (choice.type === "number") { choice = { type: "red" }; draw(); } return; }
      choice = { type: "number", number: Math.floor(Number(num.value)) }; draw();
    });
    const btn = h("button", { class: "cz-btn", text: "Lancer la bille" });
    let timer;
    btn.onclick = () => play(btn, "roulette", choice,
      () => { res.textContent = ""; res.className = "cz-res"; ball.className = "cz-ball";
        timer = setInterval(() => (ball.textContent = Math.floor(Math.random() * 37)), 70); },
      (d) => { clearInterval(timer);
        if (d) { ball.textContent = d.result.number; ball.className = "cz-ball " + d.result.color; verdict(res, d); } else ball.textContent = "?"; });
    body.append(h("div", { class: "cz-card" }, ball, opts, h("div", { class: "cz-bet" }, num), res, betBox(), btn,
      h("div", { class: "cz-pays", text: "Couleur / parité / moitié : ×2 · Numéro exact : ×36 · Le 0 fait perdre les mises simples" })));
  }

  if (tab === "top") {
    const list = h("div", { class: "cz-list" }, h("p", { text: "Chargement…" }));
    body.append(h("div", { class: "cz-card" }, h("h2", { text: "Top 10 des plus riches" }), list));
    api("/api/leaderboard").then((d) => list.replaceChildren(...d.top.map((u, i) =>
      h("div", { class: "cz-row" + (u.name === user.name ? " me" : "") },
        h("span", { text: ["🥇", "🥈", "🥉"][i] || i + 1 + "." }), h("span", { text: u.name }), h("b", { text: fmt(u.balance) + " 🪙" })))))
      .catch((e) => list.replaceChildren(h("p", { text: e.message })));
  }

  mount(top, tabs, body, h("div", { class: "cz-note", text: "Jetons virtuels sans aucune valeur réelle. Soldes et tirages gérés par le serveur." }));
}

// ---------- Entrée ----------
return {
  async open() {
    if (API.includes("REMPLACE")) {
      mount(h("div", { class: "cz-auth" }, h("div", { class: "cz-logo", text: "🛠️" }), h("h2", { text: "Casino non configuré" }),
        h("p", { text: "Déploie le serveur (dossier worker/) puis mets son URL dans casino.js (constante API)." })));
      return;
    }
    mount(h("div", { class: "cz-auth" }, h("p", { text: "Connexion au serveur…" })));
    if (token) {
      try { user = (await api("/api/me")).user; appView(); return; }
      catch (e) { if (e.status === 401) saveToken(null); else { mount(h("div", { class: "cz-auth" }, h("h2", { text: "Hors ligne" }), h("p", { text: e.message }))); return; } }
    }
    authView();
  },
};
