// FloatFrame Casino : interface complète. Chargé à la demande par floatframe.js (reçoit `ctx`).
// Toute la logique sensible (soldes, cartes, tirages, mines) est vérifiée et arbitrée par le serveur.
const API = "https://floatframe-casino.hug6314.workers.dev"; // URL Worker Cloudflare

const { h, toast, pane } = ctx;
const TK = "__floatFrameCasinoToken";
const SYM = ["🍒", "🍋", "🔔", "⭐", "7️⃣"];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const fmt = (n) => Number(n).toLocaleString("fr-FR");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
try { token = localStorage.getItem(TK); } catch {}
let user = null;
let tab = "blackjack";
let bet = 100;
let busy = false;
let rouletteHistory = [];

const CSS = `
.cz{--gold:#ffc83d;--ok:#3ddc97;--bad:#ff5d73;--accent:#7c5cff;padding:16px 18px 24px;min-height:100%;color:#eef0f8;font-size:13px}
.cz *{box-sizing:border-box}
.cz h2{margin:0;font-size:20px;font-weight:750;letter-spacing:-.3px}
.cz p{margin:4px 0 0;color:#8b90a8;font-size:12px}
.cz button{font:inherit;color:inherit;border:none}
.cz input{font:inherit;color:#eef0f8;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 12px;outline:none;width:100%}
.cz input:focus{border-color:var(--accent)}
.cz-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 15px;border-radius:11px;font-weight:650;cursor:pointer;
  background:linear-gradient(135deg,#7c5cff,#00d4ff);box-shadow:0 6px 18px rgba(124,92,255,.35);transition:.15s}
.cz-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
.cz-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none}
.cz-btn.gold{background:linear-gradient(135deg,#ffc83d,#ff8a3d);color:#2a1a00;box-shadow:0 6px 18px rgba(255,170,60,.35)}
.cz-btn.green{background:linear-gradient(135deg,#20bf6b,#0fb9b1);color:#fff;box-shadow:0 6px 18px rgba(32,191,107,.35)}
.cz-btn.red{background:linear-gradient(135deg,#eb3b5a,#fa8231);color:#fff;box-shadow:0 6px 18px rgba(235,59,90,.35)}
.cz-btn.ghost{background:rgba(255,255,255,.07);box-shadow:none}

.cz-auth{max-width:320px;margin:28px auto 0;display:flex;flex-direction:column;gap:10px;text-align:center}
.cz-logo{font-size:44px}
.cz-seg{display:flex;gap:6px;background:rgba(255,255,255,.05);padding:4px;border-radius:12px}
.cz-seg button{flex:1;padding:8px;border-radius:9px;cursor:pointer;color:#8b90a8}
.cz-seg button.on{background:rgba(124,92,255,.35);color:#fff}
.cz-msg{min-height:16px;color:var(--bad);font-size:12px}

.cz-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;background:rgba(255,255,255,.03);padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.06)}
.cz-top .who{flex:1;min-width:120px}
.cz-bal{font-size:19px;color:var(--gold);font-variant-numeric:tabular-nums}

.cz-tabs{display:flex;gap:5px;margin-bottom:14px;flex-wrap:wrap}
.cz-tabs button{padding:7px 11px;border-radius:9px;cursor:pointer;background:rgba(255,255,255,.06);color:#c9cce0;font-size:12px;transition:.15s}
.cz-tabs button:hover{background:rgba(255,255,255,.1)}
.cz-tabs button.on{background:rgba(124,92,255,.45);color:#fff;font-weight:600}

.cz-card{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:14px;align-items:center}
.cz-bet{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;width:100%}
.cz-bet input{width:100px;text-align:center;font-weight:650}
.cz-bet button{padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.08);cursor:pointer;font-size:12px}
.cz-bet button:hover{background:rgba(255,255,255,.14)}
.cz-quick-chips{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}
.cz-quick-chips button{padding:4px 8px;font-size:11px;border-radius:7px;background:rgba(255,255,255,.05);color:#a0a6c0;cursor:pointer}
.cz-quick-chips button:hover{background:rgba(124,92,255,.25);color:#fff}

.cz-res{min-height:22px;font-weight:700;font-size:14px;text-align:center}
.cz-res.win{color:var(--ok)}.cz-res.lose{color:var(--bad)}.cz-res.gold{color:var(--gold)}

/* --- Cartes & Blackjack --- */
.cz-bj-felt{width:100%;background:radial-gradient(ellipse at center,#164e3b 0%,#0c2a20 100%);border:2px solid rgba(32,191,107,.25);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:14px;box-shadow:inset 0 0 24px rgba(0,0,0,.6)}
.cz-bj-zone{display:flex;flex-direction:column;gap:6px;align-items:center}
.cz-bj-header{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;color:#9ce3c5}
.cz-bj-score{background:rgba(0,0,0,.4);padding:2px 8px;border-radius:6px;font-weight:700;color:#fff}
.cz-hand{display:flex;gap:8px;min-height:86px;align-items:center;justify-content:center;flex-wrap:wrap}

.cz-card-item{width:56px;height:82px;background:#fff;border-radius:7px;color:#1a1c24;display:flex;flex-direction:column;justify-content:space-between;padding:4px 5px;box-shadow:0 4px 10px rgba(0,0,0,.45);user-select:none;font-weight:750;transition:transform .2s}
.cz-card-item.red{color:#d62828}
.cz-card-item.back{background:linear-gradient(135deg,#1f2a44,#0b1120);border:2px solid #3b4b72;display:grid;place-items:center;color:#6b82b8;font-size:28px}
.cz-card-corner{display:flex;flex-direction:column;align-items:center;line-height:1;font-size:10px}
.cz-card-corner.bottom{transform:rotate(180deg)}
.cz-card-center{font-size:18px;align-self:center}
.cz-bj-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}

/* --- Roulette --- */
.cz-roulette-container{width:100%;display:flex;flex-direction:column;gap:12px;align-items:center}
.cz-roulette-history{display:flex;gap:6px;align-items:center;min-height:26px}
.cz-hist-chip{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:750;color:#fff}
.cz-hist-chip.red{background:#c4223a}
.cz-hist-chip.black{background:#181a24;border:1px solid rgba(255,255,255,.2)}
.cz-hist-chip.green{background:#108a4e}
.cz-ball{width:80px;height:80px;border-radius:50%;display:grid;place-items:center;font-size:30px;font-weight:800;background:#0b0d16;border:3px solid rgba(255,255,255,.15);box-shadow:0 0 20px rgba(0,0,0,.6)}
.cz-ball.red{background:#c4223a;box-shadow:0 0 22px rgba(196,34,58,.5)}
.cz-ball.black{background:#15161d;border-color:rgba(255,255,255,.3)}
.cz-ball.green{background:#1b8a52;box-shadow:0 0 22px rgba(27,138,82,.5)}
.cz-r-table{display:flex;flex-direction:column;gap:4px;width:100%;max-width:390px;background:rgba(0,0,0,.25);padding:8px;border-radius:12px;border:1px solid rgba(255,255,255,.07)}
.cz-r-row{display:flex;gap:4px;width:100%}
.cz-r-cell{flex:1;min-height:34px;display:grid;place-items:center;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);color:#cfd3ea;transition:.12s;border:1.5px solid transparent}
.cz-r-cell:hover{filter:brightness(1.25);transform:translateY(-1px)}
.cz-r-cell.on{border-color:#ffc83d!important;box-shadow:0 0 10px rgba(255,200,61,.45);color:#fff!important}
.cz-r-cell.zero{background:#1b8a52;color:#fff;font-size:14px}
.cz-r-cell.red{background:rgba(196,34,58,.8);color:#fff}
.cz-r-cell.black{background:rgba(18,20,29,.9);color:#e2e5f5;border:1px solid rgba(255,255,255,.1)}
.cz-r-cell.outside{background:rgba(255,255,255,.08);font-size:11px}

/* --- Mines --- */
.cz-mines-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;width:100%;max-width:310px}
.cz-mine-tile{aspect-ratio:1;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);display:grid;place-items:center;font-size:24px;cursor:pointer;transition:.15s;user-select:none}
.cz-mine-tile:hover:not(:disabled){background:rgba(124,92,255,.3);transform:scale(1.04)}
.cz-mine-tile.revealed{background:rgba(32,191,107,.18);border-color:#20bf6b;cursor:default}
.cz-mine-tile.bomb{background:rgba(235,59,90,.3);border-color:#eb3b5a;animation:czshake .3s ease-in-out}
.cz-mine-tile.dim{opacity:.4;cursor:default}
@keyframes czshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.cz-mines-info{display:flex;justify-content:space-between;width:100%;max-width:310px;background:rgba(255,255,255,.04);padding:8px 12px;border-radius:10px;font-size:12px}

/* --- Machine à sous & Pile ou face --- */
.cz-reels{display:flex;gap:10px}
.cz-reel{width:76px;height:84px;border-radius:14px;display:grid;place-items:center;font-size:44px;background:#0b0d16;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 0 18px rgba(0,0,0,.6)}
.cz-reel.spin{animation:czb .16s linear infinite}
@keyframes czb{50%{transform:translateY(3px)}}
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
  if (body !== undefined) {
    opt.headers["content-type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch(API + path, opt);
  } catch {
    throw new Error("Serveur injoignable");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error || "Erreur " + r.status);
    e.status = r.status;
    e.data = d;
    throw e;
  }
  return d;
}

const saveToken = (t) => {
  token = t;
  try { t ? localStorage.setItem(TK, t) : localStorage.removeItem(TK); } catch {}
};

const waitText = (ms) => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

// Affichage d'une carte à jouer
const renderCard = (cardStr) => {
  if (!cardStr || cardStr === "?") {
    return h("div", { class: "cz-card-item back" }, h("span", { text: "🂠" }));
  }
  const suit = cardStr.slice(-1);
  const val = cardStr.slice(0, -1);
  const isRed = suit === "♥" || suit === "♦";
  return h("div", { class: "cz-card-item" + (isRed ? " red" : "") },
    h("div", { class: "cz-card-corner top" }, h("span", { text: val }), h("span", { text: suit })),
    h("div", { class: "cz-card-center", text: suit }),
    h("div", { class: "cz-card-corner bottom" }, h("span", { text: val }), h("span", { text: suit }))
  );
};

// ---------- Vue Connexion ----------
function authView(mode = "login") {
  const name = shield(h("input", { type: "text", placeholder: "Pseudo", maxlength: "16", autocomplete: "off", spellcheck: "false" }));
  const pw = shield(h("input", { type: "password", placeholder: "Mot de passe", autocomplete: "off" }));
  const msg = h("div", { class: "cz-msg" });
  const go = h("button", { class: "cz-btn", text: mode === "login" ? "Se connecter" : "Créer mon compte" });

  const submit = async () => {
    msg.textContent = ""; go.disabled = true;
    try {
      const d = await api(mode === "login" ? "/api/login" : "/api/register", { name: name.value.trim(), password: pw.value });
      saveToken(d.token);
      user = d.user;
      tab = "blackjack";
      appView();
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
    h("div", { class: "cz-logo", text: "🎰" }),
    h("h2", { text: "FloatFrame Casino" }),
    h("p", { text: "Jetons virtuels uniquement · 1 000 🪙 offertes" }),
    seg, name, pw, msg, go,
    h("div", { class: "cz-note", text: "N'utilise pas un mot de passe sensible utilisé ailleurs." })));
}

// ---------- Vue Principale ----------
function appView() {
  const bal = h("b", { class: "cz-bal" });
  const setBal = (n) => { user.balance = n; bal.textContent = fmt(n) + " 🪙"; };
  setBal(user.balance);

  const daily = h("button", { class: "cz-btn gold", text: "🎁 Bonus du jour" });
  daily.onclick = async () => {
    try {
      const d = await api("/api/daily", {});
      setBal(d.balance);
      toast(`+${d.bonus} 🪙 reçus !`);
    } catch (e) {
      toast(e.data && e.data.wait ? `Reviens dans ${waitText(e.data.wait)}` : e.message);
    }
  };

  const out = h("button", { class: "cz-btn ghost", text: "Déconnexion" });
  out.onclick = async () => {
    try { await api("/api/logout", {}); } catch {}
    saveToken(null);
    user = null;
    authView();
  };

  const top = h("div", { class: "cz-top" },
    h("div", { class: "who" }, h("h2", { text: user.name }), bal),
    daily, out
  );

  const body = h("div", {});
  const names = [
    ["blackjack", "🃏 Blackjack"],
    ["roulette", "🎡 Roulette"],
    ["mines", "💣 Mines"],
    ["slots", "🎰 Machine"],
    ["coin", "🪙 Pile ou Face"],
    ["top", "🏆 Classement"],
  ];

  const tabs = h("div", { class: "cz-tabs" }, ...names.map(([id, label]) =>
    h("button", { class: id === tab ? "on" : "", text: label, onclick: () => { tab = id; appView(); } })
  ));

  const betBox = (onChange) => {
    const inp = shield(h("input", { type: "number", min: "1", step: "1" }));
    inp.value = bet;
    const sync = (v) => {
      bet = Math.max(1, Math.min(50000, Math.floor(v)));
      inp.value = bet;
      if (onChange) onChange(bet);
    };
    inp.addEventListener("input", () => sync(Number(inp.value) || 0));

    const chips = h("div", { class: "cz-quick-chips" },
      ...[100, 500, 1000, 5000].map((v) =>
        h("button", { text: `+${fmt(v)}`, onclick: () => sync(bet + v) })
      )
    );

    return h("div", { style: "display:flex;flex-direction:column;gap:6px;align-items:center;width:100%" },
      h("div", { class: "cz-bet" },
        h("button", { text: "Min", onclick: () => sync(1) }),
        h("button", { text: "½", onclick: () => sync(bet / 2) }),
        inp,
        h("button", { text: "×2", onclick: () => sync(bet * 2) }),
        h("button", { text: "Max", onclick: () => sync(Math.min(user.balance, 50000)) })
      ),
      chips
    );
  };

  const verdict = (el, d) => {
    el.className = "cz-res " + (d.delta > 0 ? "win" : d.delta === 0 ? "gold" : "lose");
    el.textContent = d.delta > 0 ? `Gagné ! +${fmt(d.delta)} 🪙` : d.delta === 0 ? "Égalité · Mise récupérée" : `Perdu −${fmt(-d.delta)} 🪙`;
  };

  // ==================== JEU 1 : BLACKJACK ====================
  if (tab === "blackjack") {
    const dealerZone = h("div", { class: "cz-bj-zone" });
    const playerZone = h("div", { class: "cz-bj-zone" });
    const dealerScore = h("span", { class: "cz-bj-score", text: "—" });
    const playerScore = h("span", { class: "cz-bj-score", text: "—" });
    const dealerCardsDiv = h("div", { class: "cz-hand" });
    const playerCardsDiv = h("div", { class: "cz-hand" });
    const res = h("div", { class: "cz-res" });
    const controls = h("div", { style: "display:flex;flex-direction:column;gap:10px;align-items:center;width:100%" });

    dealerZone.append(
      h("div", { class: "cz-bj-header" }, h("span", { text: "Croupier" }), dealerScore),
      dealerCardsDiv
    );
    playerZone.append(
      h("div", { class: "cz-bj-header" }, h("span", { text: "Ta main" }), playerScore),
      playerCardsDiv
    );

    const felt = h("div", { class: "cz-bj-felt" }, dealerZone, playerZone);

    const renderHands = (data) => {
      playerCardsDiv.replaceChildren(...data.player.cards.map(renderCard));
      playerScore.textContent = data.player.score;
      dealerCardsDiv.replaceChildren(...data.dealer.cards.map(renderCard));
      dealerScore.textContent = data.dealer.score;
    };

    const updateControls = (state) => {
      if (!state || !state.active) {
        // En attente d'une nouvelle donne
        const dealBtn = h("button", { class: "cz-btn gold", text: "🃏 Distribuer les cartes" });
        dealBtn.onclick = async () => {
          if (busy) return;
          if (bet > user.balance) { toast("Solde insuffisant"); return; }
          busy = true; dealBtn.disabled = true;
          res.textContent = "";
          try {
            const d = await api("/api/blackjack/deal", { bet });
            setBal(d.balance);
            renderHands(d);
            if (!d.active) {
              handleEnd(d);
              updateControls(null);
            } else {
              updateControls(d);
            }
          } catch (e) { toast(e.message); }
          finally { busy = false; dealBtn.disabled = false; }
        };
        controls.replaceChildren(betBox(), dealBtn);
      } else {
        // Partie active : Tirer, Rester, Doubler
        const hitBtn = h("button", { class: "cz-btn green", text: "➕ Tirer" });
        const standBtn = h("button", { class: "cz-btn red", text: "✋ Rester" });
        const doubleBtn = h("button", { class: "cz-btn gold", text: "⚡ Doubler (x2)" });
        doubleBtn.disabled = !state.canDouble;

        hitBtn.onclick = async () => {
          if (busy) return;
          busy = true; hitBtn.disabled = standBtn.disabled = doubleBtn.disabled = true;
          try {
            const d = await api("/api/blackjack/hit", {});
            setBal(d.balance);
            renderHands(d);
            if (!d.active) {
              handleEnd(d);
              updateControls(null);
            } else {
              updateControls(d);
            }
          } catch (e) { toast(e.message); }
          finally { busy = false; }
        };

        standBtn.onclick = async () => {
          if (busy) return;
          busy = true; hitBtn.disabled = standBtn.disabled = doubleBtn.disabled = true;
          try {
            const d = await api("/api/blackjack/stand", {});
            setBal(d.balance);
            renderHands(d);
            handleEnd(d);
            updateControls(null);
          } catch (e) { toast(e.message); }
          finally { busy = false; }
        };

        doubleBtn.onclick = async () => {
          if (busy) return;
          busy = true; hitBtn.disabled = standBtn.disabled = doubleBtn.disabled = true;
          try {
            const d = await api("/api/blackjack/double", {});
            setBal(d.balance);
            renderHands(d);
            handleEnd(d);
            updateControls(null);
          } catch (e) { toast(e.message); }
          finally { busy = false; }
        };

        controls.replaceChildren(
          h("div", { style: "font-weight:700;color:var(--gold);font-size:13px", text: `Mise en jeu : ${fmt(state.bet)} 🪙` }),
          h("div", { class: "cz-bj-actions" }, hitBtn, standBtn, doubleBtn)
        );
      }
    };

    const handleEnd = (d) => {
      if (d.status === "blackjack") {
        res.className = "cz-res win";
        res.textContent = `🎉 BLACKJACK ! +${fmt(d.delta)} 🪙`;
      } else if (d.status === "bust") {
        res.className = "cz-res lose";
        res.textContent = `💥 BUST ! Dépassé 21 (−${fmt(d.bet)} 🪙)`;
      } else if (d.status === "dealer_bust") {
        res.className = "cz-res win";
        res.textContent = `🎉 Le croupier dépasse 21 ! +${fmt(d.delta)} 🪙`;
      } else if (d.status === "win") {
        res.className = "cz-res win";
        res.textContent = `✨ Gagné ! +${fmt(d.delta)} 🪙`;
      } else if (d.status === "push") {
        res.className = "cz-res gold";
        res.textContent = `🤝 Égalité · Mise récupérée`;
      } else if (d.status === "dealer_blackjack") {
        res.className = "cz-res lose";
        res.textContent = `💀 Blackjack du croupier (−${fmt(d.bet)} 🪙)`;
      } else {
        res.className = "cz-res lose";
        res.textContent = `❌ Perdu contre le croupier (−${fmt(d.bet)} 🪙)`;
      }
    };

    updateControls(null);
    body.append(h("div", { class: "cz-card" },
      felt,
      res,
      controls,
      h("div", { class: "cz-pays", text: "Blackjack naturel paie 3:2 · Le croupier s'arrête à 17 · Doubler autorise 1 carte supplémentaire" })
    ));

    // Récupération de l'état actif éventuel
    api("/api/blackjack/state").then((d) => {
      if (d.active) {
        renderHands(d);
        updateControls(d);
      }
    }).catch(() => {});
  }

  // ==================== JEU 2 : ROULETTE ====================
  if (tab === "roulette") {
    let choice = { type: "red" };
    const ball = h("div", { class: "cz-ball", text: "?" });
    const res = h("div", { class: "cz-res" });
    const choiceTag = h("div", { style: "font-weight:700;color:var(--gold);font-size:13px;min-height:18px" });
    const historyDiv = h("div", { class: "cz-roulette-history" });

    const updateHistory = () => {
      historyDiv.replaceChildren(
        h("span", { style: "font-size:11px;color:#8b90a8", text: "Derniers numéros :" }),
        ...rouletteHistory.map((item) =>
          h("div", { class: "cz-hist-chip " + item.color, text: String(item.number) })
        )
      );
    };
    updateHistory();

    const updateChoiceTag = () => {
      const labels = {
        red: "Rouge (×2)", black: "Noir (×2)", even: "Pair (×2)", odd: "Impair (×2)",
        low: "1–18 (×2)", high: "19–36 (×2)",
        dozen1: "1ère Douzaine 1-12 (×3)", dozen2: "2ème Douzaine 13-24 (×3)", dozen3: "3ème Douzaine 25-36 (×3)",
        col1: "Colonne 1 (×3)", col2: "Colonne 2 (×3)", col3: "Colonne 3 (×3)",
      };
      choiceTag.textContent = choice.type === "number" ? `Numéro exact : ${choice.number} (×36)` : `Pari sélectionné : ${labels[choice.type] || choice.type}`;
    };

    // Table de roulette interactive
    const tableDiv = h("div", { class: "cz-r-table" });

    const setChoice = (newChoice) => {
      choice = newChoice;
      tableDiv.querySelectorAll(".cz-r-cell").forEach((el) => el.classList.remove("on"));
      const target = tableDiv.querySelector(`[data-bet="${choice.type === 'number' ? 'num-' + choice.number : choice.type}"]`);
      if (target) target.classList.add("on");
      updateChoiceTag();
    };

    // Case 0
    const zeroCell = h("div", { class: "cz-r-cell zero", "data-bet": "num-0", text: "0", onclick: () => setChoice({ type: "number", number: 0 }) });

    // Lignes de numéros (1 à 36 organisés en 3 rangées)
    // Rangée 1 : 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
    // Rangée 2 : 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
    // Rangée 3 : 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
    const makeNumRow = (nums, colId, colLabel) => {
      const row = h("div", { class: "cz-r-row" });
      nums.forEach((n) => {
        const c = REDS.has(n) ? "red" : "black";
        row.append(h("div", {
          class: "cz-r-cell " + c,
          "data-bet": "num-" + n,
          text: String(n),
          onclick: () => setChoice({ type: "number", number: n }),
        }));
      });
      row.append(h("div", {
        class: "cz-r-cell outside",
        "data-bet": colId,
        text: colLabel,
        onclick: () => setChoice({ type: colId }),
      }));
      return row;
    };

    const row1 = makeNumRow([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], "col3", "Col 3");
    const row2 = makeNumRow([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], "col2", "Col 2");
    const row3 = makeNumRow([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], "col1", "Col 1");

    // Douzaines
    const dozensRow = h("div", { class: "cz-r-row" },
      h("div", { class: "cz-r-cell outside", "data-bet": "dozen1", text: "1–12", onclick: () => setChoice({ type: "dozen1" }) }),
      h("div", { class: "cz-r-cell outside", "data-bet": "dozen2", text: "13–24", onclick: () => setChoice({ type: "dozen2" }) }),
      h("div", { class: "cz-r-cell outside", "data-bet": "dozen3", text: "25–36", onclick: () => setChoice({ type: "dozen3" }) })
    );

    // Mises simples (1-18, Pair, Rouge, Noir, Impair, 19-36)
    const outsideRow = h("div", { class: "cz-r-row" },
      h("div", { class: "cz-r-cell outside", "data-bet": "low", text: "1–18", onclick: () => setChoice({ type: "low" }) }),
      h("div", { class: "cz-r-cell outside", "data-bet": "even", text: "Pair", onclick: () => setChoice({ type: "even" }) }),
      h("div", { class: "cz-r-cell red", "data-bet": "red", text: "Rouge", onclick: () => setChoice({ type: "red" }) }),
      h("div", { class: "cz-r-cell black", "data-bet": "black", text: "Noir", onclick: () => setChoice({ type: "black" }) }),
      h("div", { class: "cz-r-cell outside", "data-bet": "odd", text: "Impair", onclick: () => setChoice({ type: "odd" }) }),
      h("div", { class: "cz-r-cell outside", "data-bet": "high", text: "19–36", onclick: () => setChoice({ type: "high" }) })
    );

    tableDiv.append(zeroCell, row1, row2, row3, dozensRow, outsideRow);
    setChoice({ type: "red" });

    const btn = h("button", { class: "cz-btn gold", text: "🎡 Lancer la bille" });
    let timer;

    btn.onclick = async () => {
      if (busy) return;
      if (bet > user.balance) { toast("Solde insuffisant"); return; }
      busy = true; btn.disabled = true;
      res.textContent = ""; res.className = "cz-res";
      ball.className = "cz-ball";
      timer = setInterval(() => {
        const rnd = Math.floor(Math.random() * 37);
        ball.textContent = String(rnd);
      }, 65);

      try {
        const [d] = await Promise.all([
          api("/api/play", { game: "roulette", bet, choice }),
          sleep(1100),
        ]);
        clearInterval(timer);
        ball.textContent = String(d.result.number);
        ball.className = "cz-ball " + d.result.color;
        rouletteHistory.unshift({ number: d.result.number, color: d.result.color });
        if (rouletteHistory.length > 6) rouletteHistory.pop();
        updateHistory();
        verdict(res, d);
        setBal(d.balance);
      } catch (e) {
        clearInterval(timer);
        ball.textContent = "?";
        toast(e.message);
      } finally {
        busy = false; btn.disabled = false;
      }
    };

    body.append(h("div", { class: "cz-card" },
      historyDiv,
      ball,
      choiceTag,
      tableDiv,
      res,
      betBox(),
      btn,
      h("div", { class: "cz-pays", text: "Couleur / Parité / Moitié : ×2 · Douzaines / Colonnes : ×3 · Numéro direct : ×36 · Le 0 fait perdre les mises extérieures" })
    ));
  }

  // ==================== JEU 3 : MINES ====================
  if (tab === "mines") {
    let minesCount = 3;
    const grid = h("div", { class: "cz-mines-grid" });
    const info = h("div", { class: "cz-mines-info" });
    const res = h("div", { class: "cz-res" });
    const controls = h("div", { style: "display:flex;flex-direction:column;gap:10px;align-items:center;width:100%" });

    const renderGrid = (activeGame, endResult) => {
      grid.replaceChildren();
      for (let i = 0; i < 25; i++) {
        const tile = h("button", { class: "cz-mine-tile", "data-idx": i });
        if (activeGame && activeGame.revealed.includes(i)) {
          tile.classList.add("revealed");
          tile.textContent = "💎";
        } else if (endResult) {
          if (endResult.bomb && endResult.hitIndex === i) {
            tile.classList.add("bomb");
            tile.textContent = "💥";
          } else if (endResult.mines && endResult.mines.includes(i)) {
            tile.classList.add("dim");
            tile.textContent = "💣";
          } else if (endResult.revealed && endResult.revealed.includes(i)) {
            tile.classList.add("revealed");
            tile.textContent = "💎";
          } else {
            tile.classList.add("dim");
            tile.textContent = "💎";
          }
        }
        tile.onclick = () => onTileClick(i);
        grid.append(tile);
      }
    };

    const updateInfo = (activeGame) => {
      if (!activeGame) {
        info.replaceChildren(
          h("span", { text: `Mines : ${minesCount}` }),
          h("span", { text: `Diamants : ${25 - minesCount}` })
        );
      } else {
        info.replaceChildren(
          h("span", { text: `Multiplicateur : x${activeGame.mult.toFixed(2)}` }),
          h("span", { text: `Prochain : x${activeGame.nextMult.toFixed(2)}` }),
          h("b", { style: "color:var(--gold)", text: `Gain : ${fmt(activeGame.cashout)} 🪙` })
        );
      }
    };

    let currentGame = null;

    const onTileClick = async (idx) => {
      if (!currentGame || busy) return;
      busy = true;
      try {
        const d = await api("/api/mines/reveal", { index: idx });
        setBal(d.balance);
        if (d.bomb) {
          currentGame = null;
          renderGrid(null, d);
          res.className = "cz-res lose";
          res.textContent = `💥 BOOM ! Mine touchée (−${fmt(d.delta ? -d.delta : bet)} 🪙)`;
          updateControls(null);
        } else if (d.allCleared) {
          currentGame = null;
          renderGrid(null, d);
          res.className = "cz-res win";
          res.textContent = `🎉 INCROYABLE ! Tous les diamants découverts ! +${fmt(d.delta)} 🪙`;
          updateControls(null);
        } else {
          currentGame.revealed = d.revealed;
          currentGame.mult = d.mult;
          currentGame.nextMult = d.nextMult;
          currentGame.cashout = d.cashout;
          renderGrid(currentGame);
          updateInfo(currentGame);
          updateControls(currentGame);
        }
      } catch (e) { toast(e.message); }
      finally { busy = false; }
    };

    const updateControls = (activeGame) => {
      if (!activeGame) {
        const startBtn = h("button", { class: "cz-btn gold", text: "💣 Commencer la partie" });
        const mineOptions = h("div", { class: "cz-bet" },
          h("span", { style: "font-size:12px;color:#8b90a8", text: "Nombre de mines :" }),
          ...[1, 3, 5, 10, 15].map((m) =>
            h("button", {
              style: minesCount === m ? "background:rgba(124,92,255,.45);color:#fff;font-weight:700" : "",
              text: String(m),
              onclick: () => { minesCount = m; updateInfo(null); updateControls(null); }
            })
          )
        );

        startBtn.onclick = async () => {
          if (busy) return;
          if (bet > user.balance) { toast("Solde insuffisant"); return; }
          busy = true; startBtn.disabled = true;
          res.textContent = "";
          try {
            const d = await api("/api/mines/start", { bet, minesCount });
            setBal(d.balance);
            currentGame = d;
            renderGrid(d);
            updateInfo(d);
            updateControls(d);
          } catch (e) { toast(e.message); }
          finally { busy = false; startBtn.disabled = false; }
        };

        controls.replaceChildren(mineOptions, betBox(), startBtn);
        updateInfo(null);
      } else {
        const cashBtn = h("button", {
          class: "cz-btn green",
          text: `💰 Encaisser ${fmt(activeGame.cashout)} 🪙`,
        });
        cashBtn.disabled = activeGame.revealed.length === 0;

        cashBtn.onclick = async () => {
          if (busy) return;
          busy = true; cashBtn.disabled = true;
          try {
            const d = await api("/api/mines/cashout", {});
            setBal(d.balance);
            currentGame = null;
            renderGrid(null, d);
            res.className = "cz-res win";
            res.textContent = `🎉 Encaissé avec succès ! +${fmt(d.delta)} 🪙 (x${d.mult.toFixed(2)})`;
            updateControls(null);
          } catch (e) { toast(e.message); }
          finally { busy = false; }
        };

        controls.replaceChildren(cashBtn);
      }
    };

    renderGrid(null);
    updateControls(null);

    body.append(h("div", { class: "cz-card" },
      info,
      grid,
      res,
      controls,
      h("div", { class: "cz-pays", text: "Clique sur les cases pour révéler des diamants 💎. Encaisse tes gains quand tu veux avant de toucher une mine 💣 !" })
    ));

    api("/api/mines/state").then((d) => {
      if (d.active) {
        currentGame = d;
        minesCount = d.minesCount;
        renderGrid(d);
        updateInfo(d);
        updateControls(d);
      }
    }).catch(() => {});
  }

  // ==================== JEU 4 : MACHINE À SOUS ====================
  if (tab === "slots") {
    const reels = [0, 1, 2].map(() => h("div", { class: "cz-reel", text: "🎰" }));
    const res = h("div", { class: "cz-res" });
    const btn = h("button", { class: "cz-btn gold", text: "Lancer les rouleaux" });
    let timer;

    btn.onclick = async () => {
      if (busy) return;
      if (bet > user.balance) { toast("Solde insuffisant"); return; }
      busy = true; btn.disabled = true;
      res.textContent = ""; res.className = "cz-res";
      reels.forEach((r) => r.classList.add("spin"));
      timer = setInterval(() => reels.forEach((r) => (r.textContent = SYM[Math.floor(Math.random() * 5)])), 70);

      try {
        const [d] = await Promise.all([
          api("/api/play", { game: "slots", bet, choice: null }),
          sleep(900),
        ]);
        clearInterval(timer);
        reels.forEach((r) => r.classList.remove("spin"));
        d.result.reels.forEach((s, i) => (reels[i].textContent = SYM[s]));
        verdict(res, d);
        setBal(d.balance);
      } catch (e) {
        clearInterval(timer);
        reels.forEach((r) => r.classList.remove("spin"));
        toast(e.message);
      } finally {
        busy = false; btn.disabled = false;
      }
    };

    body.append(h("div", { class: "cz-card" },
      h("div", { class: "cz-reels" }, ...reels),
      res,
      betBox(),
      btn,
      h("div", { class: "cz-pays", text: "3 identiques : 🍒×7 · 🍋×24 · 🔔×14 · ⭐×9 · 7️⃣×40  —  2 identiques : ×0,4" })
    ));
  }

  // ==================== JEU 5 : PILE OU FACE ====================
  if (tab === "coin") {
    let side = "pile";
    const coin = h("div", { class: "cz-coin", text: "PILE" });
    const res = h("div", { class: "cz-res" });
    const opts = h("div", { class: "cz-bet" });

    const draw = () => opts.replaceChildren(...[["pile", "Pile"], ["face", "Face"]].map(([v, l]) =>
      h("button", {
        style: side === v ? "background:rgba(124,92,255,.45);color:#fff;font-weight:700" : "",
        text: l,
        onclick: () => { side = v; draw(); }
      })
    ));
    draw();

    const btn = h("button", { class: "cz-btn gold", text: "Lancer la pièce" });
    btn.onclick = async () => {
      if (busy) return;
      if (bet > user.balance) { toast("Solde insuffisant"); return; }
      busy = true; btn.disabled = true;
      res.textContent = ""; res.className = "cz-res";
      coin.classList.add("spin");

      try {
        const [d] = await Promise.all([
          api("/api/play", { game: "coin", bet, choice: { side } }),
          sleep(750),
        ]);
        coin.classList.remove("spin");
        coin.textContent = d.result.side.toUpperCase();
        verdict(res, d);
        setBal(d.balance);
      } catch (e) {
        coin.classList.remove("spin");
        toast(e.message);
      } finally {
        busy = false; btn.disabled = false;
      }
    };

    body.append(h("div", { class: "cz-card" },
      coin,
      opts,
      res,
      betBox(),
      btn,
      h("div", { class: "cz-pays", text: "Gain sur la bonne face : ×1,95" })
    ));
  }

  // ==================== CLASSEMENT ====================
  if (tab === "top") {
    const list = h("div", { class: "cz-list" }, h("p", { text: "Chargement du classement…" }));
    body.append(h("div", { class: "cz-card" }, h("h2", { text: "Top 10 des plus riches" }), list));
    api("/api/leaderboard").then((d) => list.replaceChildren(...d.top.map((u, i) =>
      h("div", { class: "cz-row" + (u.name === user.name ? " me" : "") },
        h("span", { text: ["🥇", "🥈", "🥉"][i] || i + 1 + "." }),
        h("span", { text: u.name }),
        h("b", { text: fmt(u.balance) + " 🪙" })
      )
    ))).catch((e) => list.replaceChildren(h("p", { text: e.message })));
  }

  mount(top, tabs, body, h("div", { class: "cz-note", text: "Jetons virtuels sans valeur monétaire réelle. Règlements et tirages sécurisés côté serveur." }));
}

// ---------- Entrée ----------
return {
  async open() {
    if (API.includes("REMPLACE")) {
      mount(h("div", { class: "cz-auth" },
        h("div", { class: "cz-logo", text: "🛠️" }),
        h("h2", { text: "Casino non configuré" }),
        h("p", { text: "Déploie le serveur (dossier worker/) puis mets son URL dans casino.js (constante API)." })
      ));
      return;
    }
    mount(h("div", { class: "cz-auth" }, h("p", { text: "Connexion au serveur…" })));
    if (token) {
      try {
        user = (await api("/api/me")).user;
        appView();
        return;
      } catch (e) {
        if (e.status === 401) saveToken(null);
        else {
          mount(h("div", { class: "cz-auth" }, h("h2", { text: "Hors ligne" }), h("p", { text: e.message })));
          return;
        }
      }
    }
    authView();
  },
};
