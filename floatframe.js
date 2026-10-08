(() => {
  // === SITES PAR DÉFAUT (modifie cette liste comme tu veux) ===
  const DEFAULT_SITES = [
    { name: "FrAnime", url: "https://franime.fr" },
    { name: "BrainworxEdu", url: "https://brainworxedu.github.io" },
    { name: "KartBros", url: "https://kartbros.io" },
    { name: "BikeBros", url: "https://bikebros.io" },
  ];

  const STORAGE_KEY = "__floatFrameFavorites";
  const HOST_ID = "__floatFrameHost";

  // Nettoyer les instances précédentes (anciennes versions comprises)
  [HOST_ID, "__floatFrameWrapper", "__floatFrameBubble"].forEach((id) =>
    document.getElementById(id)?.remove()
  );

  // === Utilitaires ===
  const normalizeUrl = (input) => {
    let u = input.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  };
  const getDomain = (u) => u.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0];
  const isValid = (s) => {
    try {
      const u = new URL(normalizeUrl(s));
      return /\.[a-z]{2,}$/i.test(u.hostname) || u.hostname === "localhost";
    } catch { return false; }
  };
  const hueOf = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
  const guessName = (domain) => {
    const p = domain.split(".");
    const base = p[0].length > 2 || p.length < 2 ? p[0] : p[1];
    return base.charAt(0).toUpperCase() + base.slice(1);
  };

  // Création d'éléments DOM (compatible Trusted Types : pas de innerHTML)
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && c !== false && el.append(c));
    return el;
  };

  // Icônes SVG
  const P = {
    globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
    min: "M5 12h14",
    max: "M5 5h14v14H5z",
    restore: "M9 9V4h11v11h-5M4 9h11v11H4z",
    close: "M6 6l12 12M18 6L6 18",
    plus: "M12 5v14M5 12h14",
    reload: "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5",
    full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    exitfull: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
    star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z",
    link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    arrow: "M5 12h14M13 6l6 6-6 6",
    reset: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  };
  const NS = "http://www.w3.org/2000/svg";
  const ico = (d, size = 16) => {
    const s = document.createElementNS(NS, "svg");
    const set = (e, o) => Object.entries(o).forEach(([k, v]) => e.setAttribute(k, v));
    set(s, { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor",
      "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    s.appendChild(p);
    return s;
  };

  // === Favoris (stockés en mémoire + localStorage) ===
  const readStorage = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) return saved;
    } catch {}
    return DEFAULT_SITES.map((s) => ({ ...s }));
  };
  let favs = readStorage();
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)); } catch {} };

  // === Hôte + Shadow DOM (isole le style du site visité) ===
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });

  const CSS = `
*,*::before,*::after{box-sizing:border-box}
.win,.bubble,button,input{font-family:Inter,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
button{border:0;background:none;color:inherit;cursor:pointer;padding:0;font-size:inherit}
@keyframes pop{from{opacity:0;transform:scale(.93) translateY(12px)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.95)}to{opacity:1;transform:none}}
@keyframes ring{0%{transform:scale(.9);opacity:.7}100%{transform:scale(1.7);opacity:0}}
@keyframes fade{from{opacity:0}to{opacity:1}}

.win{--bg:rgba(15,17,26,.94);--line:rgba(255,255,255,.08);--txt:#eef0f8;--mut:#8b90a8;--a1:#7c5cff;--a2:#00d4ff;
  position:fixed;top:70px;left:70px;width:700px;height:520px;min-width:380px;min-height:300px;max-width:100vw;max-height:100vh;
  display:flex;flex-direction:column;color:var(--txt);font-size:13px;
  background:var(--bg);backdrop-filter:blur(26px) saturate(170%);-webkit-backdrop-filter:blur(26px) saturate(170%);
  border:1px solid var(--line);border-radius:18px;
  box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);
  overflow:hidden;animation:pop .32s cubic-bezier(.2,.9,.3,1.15)}
.win.max{top:0!important;left:0!important;width:100vw!important;height:100vh!important;border-radius:0;border:0}
.win.hidden{display:none}
.win.busy .frame{pointer-events:none}

/* Mode "page entière" : cache barre de titre, favoris et barre d'adresse */
.win.full{top:0!important;left:0!important;width:100vw!important;height:100vh!important;max-width:none;border-radius:0;border:0;box-shadow:none;animation:none}
.win.full .bar,.win.full .prog,.win.full .tabs,.win.full .addr,.win.full .grip{display:none}
.win.full .stage{border-top:0}
.exitfs{display:none;position:absolute;top:12px;right:12px;z-index:30;width:38px;height:38px;border-radius:12px;place-items:center;color:#fff;
  background:rgba(15,17,26,.75);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  opacity:.35;transition:.2s}
.win.full .exitfs{display:grid}
.exitfs:hover{opacity:1;background:#ff4d63;transform:scale(1.06)}

.bar{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;cursor:grab;user-select:none;-webkit-user-select:none;
  border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0));touch-action:none}
.bar.grabbing{cursor:grabbing}
.logo{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;color:#fff;flex-shrink:0;
  background:linear-gradient(135deg,var(--a1),var(--a2));box-shadow:0 4px 14px rgba(124,92,255,.45)}
.ttl{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.ttl b{font-size:13.5px;font-weight:650;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ttl small{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wbs{display:flex;gap:4px}
.wb{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:var(--mut);transition:.15s}
.wb:hover{background:rgba(255,255,255,.1);color:#fff}
.wb.close:hover{background:#ff4d63;color:#fff}

.prog{height:2px;opacity:0;transition:opacity .25s;flex-shrink:0}
.prog.show{opacity:1}
.prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--a1),var(--a2));box-shadow:0 0 10px var(--a2);transition:width .8s ease-out}

.tabs{display:flex;gap:7px;padding:9px 12px;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
.tabs::-webkit-scrollbar{display:none}
.chip{display:flex;align-items:center;gap:7px;padding:5px 9px 5px 6px;border-radius:999px;white-space:nowrap;flex-shrink:0;font-size:12.5px;
  background:rgba(255,255,255,.055);border:1px solid var(--line);transition:.18s}
.chip.home{padding-left:11px}
.chip:hover{background:rgba(255,255,255,.11);transform:translateY(-1px)}
.chip.active{background:linear-gradient(135deg,rgba(124,92,255,.38),rgba(0,212,255,.22));border-color:rgba(124,92,255,.7);box-shadow:0 4px 16px rgba(124,92,255,.25)}
.chip .x{width:0;height:16px;border-radius:50%;display:grid;place-items:center;color:var(--mut);opacity:0;overflow:hidden;transition:.15s}
.chip:hover .x{opacity:1;width:16px}
.chip .x:hover{background:#ff4d63;color:#fff}

.addr{display:flex;align-items:center;gap:8px;padding:2px 12px 10px;flex-shrink:0}
.btn{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;flex-shrink:0;color:#c9cde0;
  background:rgba(255,255,255,.055);border:1px solid var(--line);transition:.15s}
.btn:hover{background:rgba(255,255,255,.12);color:#fff;transform:translateY(-1px)}
.btn.on{color:#ffc542;background:rgba(255,197,66,.12);border-color:rgba(255,197,66,.4)}
.btn.on svg{fill:#ffc542}
.url{flex:1;min-width:0;height:36px;display:flex;align-items:center;gap:8px;padding:0 4px 0 12px;border-radius:11px;
  background:rgba(0,0,0,.32);border:1px solid var(--line);color:var(--mut);transition:.15s}
.url:focus-within{border-color:rgba(124,92,255,.8);box-shadow:0 0 0 3px rgba(124,92,255,.22);color:#fff}
.url input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--txt);font-size:13px}
.url input::placeholder{color:#6b7090}
.go{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#fff;flex-shrink:0;
  background:linear-gradient(135deg,var(--a1),var(--a2));transition:.15s}
.go:hover{filter:brightness(1.15);transform:scale(1.06)}

.stage{position:relative;flex:1;min-height:0;display:flex;border-top:1px solid var(--line)}
.hub{flex:1;overflow-y:auto;padding:20px 20px 28px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent;
  background:radial-gradient(520px 260px at 0% 0%,rgba(124,92,255,.2),transparent 70%),
             radial-gradient(460px 260px at 100% 100%,rgba(0,212,255,.15),transparent 70%)}
.hub.off{display:none}
.hub-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:16px}
.hub-head h2{margin:0;font-size:22px;font-weight:750;letter-spacing:-.3px;
  background:linear-gradient(90deg,#fff,#b9a8ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.hub-head p{margin:4px 0 0;color:var(--mut);font-size:12px}
.ghost{display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:10px;font-size:12px;color:var(--mut);
  border:1px solid var(--line);background:rgba(255,255,255,.04);transition:.15s;flex-shrink:0}
.ghost:hover{color:#fff;background:rgba(255,255,255,.1)}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px}
.card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 12px 16px;border-radius:16px;
  text-align:center;cursor:pointer;outline:0;color:inherit;
  background:linear-gradient(160deg,rgba(255,255,255,.085),rgba(255,255,255,.03));border:1px solid var(--line);
  transition:transform .2s,box-shadow .2s,border-color .2s;
  animation:rise .45s cubic-bezier(.2,.8,.3,1) both;animation-delay:calc(var(--i,0) * 45ms)}
.card:hover,.card:focus-visible{transform:translateY(-5px) scale(1.02);border-color:rgba(124,92,255,.65);
  box-shadow:0 14px 34px rgba(0,0,0,.4),0 0 0 1px rgba(124,92,255,.35),0 0 30px rgba(124,92,255,.2)}
.card .ico{margin-bottom:4px;box-shadow:0 8px 20px rgba(0,0,0,.35)}
.nm{font-weight:650;font-size:13.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dm{font-size:11px;color:var(--mut);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .rm{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
  color:var(--mut);background:rgba(0,0,0,.35);opacity:0;transform:scale(.8);transition:.15s}
.card:hover .rm{opacity:1;transform:none}
.card .rm:hover{background:#ff4d63;color:#fff}
.card.add{justify-content:center;background:transparent;border:1.5px dashed rgba(255,255,255,.18);color:var(--mut)}
.card.add:hover{color:#fff;border-color:rgba(124,92,255,.8)}
.plus{width:54px;height:54px;border-radius:28%;display:grid;place-items:center;background:rgba(255,255,255,.06);margin-bottom:4px}

.ico{display:grid;place-items:center;border-radius:28%;color:#fff;font-weight:800;flex-shrink:0;overflow:hidden;user-select:none}
.ico.has-img{background:#fff}
.ico img{width:62%;height:62%;object-fit:contain;display:block}

.frame{display:none;flex:1;width:100%;border:0;background:#fff}
.frame.on{display:block}

.grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;z-index:5;touch-action:none;
  background:linear-gradient(135deg,transparent 52%,rgba(255,255,255,.35) 52%,rgba(255,255,255,.35) 58%,transparent 58%,transparent 70%,rgba(255,255,255,.35) 70%,rgba(255,255,255,.35) 76%,transparent 76%)}
.win.max .grip{display:none}

.modal{position:absolute;inset:0;display:none;place-items:center;background:rgba(6,7,12,.6);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:40}
.modal.on{display:grid;animation:fade .18s}
.mcard{width:min(340px,86%);padding:20px;border-radius:16px;background:#171a27;border:1px solid var(--line);
  box-shadow:0 24px 60px rgba(0,0,0,.6);animation:pop .22s cubic-bezier(.2,.9,.3,1.2)}
.mcard h3{margin:0 0 6px;font-size:15px}
.mcard p{margin:0 0 12px;color:var(--mut);font-size:12px;word-break:break-all}
.m-in{width:100%;height:38px;padding:0 12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid var(--line);
  color:var(--txt);font-size:13px;outline:0;margin-bottom:14px}
.m-in:focus{border-color:rgba(124,92,255,.8);box-shadow:0 0 0 3px rgba(124,92,255,.22)}
.mact{display:flex;justify-content:flex-end;gap:8px}
.mbtn{padding:8px 14px;border-radius:10px;font-size:12.5px;color:var(--mut);background:rgba(255,255,255,.06);transition:.15s}
.mbtn:hover{color:#fff;background:rgba(255,255,255,.12)}
.mbtn.main{color:#fff;font-weight:600;background:linear-gradient(135deg,var(--a1),var(--a2))}
.mbtn.main:hover{filter:brightness(1.12)}
.mbtn.danger{background:linear-gradient(135deg,#ff4d63,#ff7a45)}

.toast{position:absolute;left:50%;bottom:18px;transform:translate(-50%,16px);padding:9px 16px;border-radius:999px;
  background:rgba(30,33,48,.96);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.45);
  font-size:12.5px;opacity:0;pointer-events:none;transition:.25s;z-index:50;white-space:nowrap}
.toast.on{opacity:1;transform:translate(-50%,0)}

.bubble{position:fixed;right:24px;bottom:24px;width:56px;height:56px;border-radius:50%;display:none;place-items:center;color:#fff;
  background:linear-gradient(135deg,#7c5cff,#00d4ff);box-shadow:0 10px 30px rgba(124,92,255,.5);transition:transform .2s;animation:pop .3s}
.bubble.on{display:grid}
.bubble:hover{transform:scale(1.1)}
.bubble .ring{position:absolute;inset:0;border-radius:50%;border:2px solid #7c5cff;animation:ring 2s infinite;pointer-events:none}
`;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const st = document.createElement("style");
    st.textContent = CSS;
    root.appendChild(st);
  }

  // === Icône de site (favicon + lettre colorée en secours) ===
  const makeIcon = (fav, size) => {
    const domain = getDomain(fav.url);
    const hue = hueOf(fav.name);
    const box = h("div", { class: "ico" });
    box.style.width = box.style.height = size + "px";
    box.style.fontSize = Math.round(size * 0.46) + "px";
    box.style.background = `linear-gradient(135deg,hsl(${hue} 75% 58%),hsl(${(hue + 40) % 360} 75% 45%))`;
    box.textContent = (fav.name[0] || "?").toUpperCase();

    const sources = [
      `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      `https://${domain}/favicon.ico`,
    ];
    let i = 0;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.onload = () => {
      box.textContent = "";
      box.style.background = "";
      box.classList.add("has-img");
      box.append(img);
    };
    img.onerror = () => { if (++i < sources.length) img.src = sources[i]; };
    img.src = sources[0];
    return box;
  };

  // === Structure ===
  const win = h("div", { class: "win" });

  // Barre de titre
  const titleMain = h("b", { text: "FloatFrame" });
  const titleSub = h("small", { text: "Ton hub de sites" });
  const btnMin = h("button", { class: "wb", title: "Réduire" }, ico(P.min, 15));
  const btnMax = h("button", { class: "wb", title: "Agrandir" }, ico(P.max, 14));
  const btnClose = h("button", { class: "wb close", title: "Fermer" }, ico(P.close, 15));
  const bar = h("div", { class: "bar" },
    h("div", { class: "logo" }, ico(P.globe, 16)),
    h("div", { class: "ttl" }, titleMain, titleSub),
    h("div", { class: "wbs" }, btnMin, btnMax, btnClose)
  );

  // Barre de progression
  const progBar = h("i");
  const prog = h("div", { class: "prog" }, progBar);

  // Onglets (chips)
  const tabs = h("div", { class: "tabs" });

  // Barre d'adresse
  const btnHome = h("button", { class: "btn", title: "Retour au hub" }, ico(P.home, 17));
  const btnReload = h("button", { class: "btn", title: "Recharger" }, ico(P.reload, 16));
  const input = h("input", { type: "text", placeholder: "Colle un lien (ex: monsite.com)", spellcheck: "false", autocomplete: "off" });
  const btnGo = h("button", { class: "go", title: "Ouvrir" }, ico(P.arrow, 16));
  const btnStar = h("button", { class: "btn", title: "Ajouter au hub" }, ico(P.star, 17));
  const btnFull = h("button", { class: "btn", title: "Page entière" }, ico(P.full, 16));
  const btnExit = h("button", { class: "exitfs", title: "Quitter (Échap)" }, ico(P.exitfull, 18));
  const addr = h("div", { class: "addr" },
    btnHome, btnReload,
    h("div", { class: "url" }, ico(P.link, 15), input, btnGo),
    btnStar, btnFull
  );

  // Contenu
  const hub = h("div", { class: "hub" });
  const frame = h("iframe", { class: "frame" });

  // === Toutes les permissions pour jouer (caméra, micro, manette, plein écran...) ===
  frame.setAttribute(
    "allow",
    [
      "camera *", "microphone *", "geolocation *", "fullscreen *", "autoplay *",
      "clipboard-read *", "clipboard-write *", "display-capture *",
      "encrypted-media *", "picture-in-picture *", "screen-wake-lock *",
      "gamepad *", "keyboard-map *", "midi *", "accelerometer *", "gyroscope *",
      "magnetometer *", "xr-spatial-tracking *", "web-share *", "speaker-selection *",
      "hid *", "serial *", "usb *", "bluetooth *", "idle-detection *",
      "payment *", "publickey-credentials-get *", "storage-access *",
    ].join("; ")
  );
  frame.allowFullscreen = true;

  const stage = h("div", { class: "stage" }, hub, frame);

  const grip = h("div", { class: "grip" });
  const modal = h("div", { class: "modal" });
  const toastEl = h("div", { class: "toast" });
  win.append(bar, prog, tabs, addr, stage, grip, modal, toastEl, btnExit);

  const bubble = h("button", { class: "bubble", title: "Rouvrir FloatFrame" },
    h("span", { class: "ring" }), ico(P.globe, 24));

  root.append(win, bubble);
  document.body.appendChild(host);

  // Position / taille initiales (centrées)
  const w0 = Math.min(700, innerWidth - 20);
  const h0 = Math.min(520, innerHeight - 20);
  win.style.width = w0 + "px";
  win.style.height = h0 + "px";
  win.style.left = Math.max(10, (innerWidth - w0) / 2) + "px";
  win.style.top = Math.max(10, (innerHeight - h0) / 2) + "px";

  // === Toast + boîte de dialogue ===
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2200);
  };

  const ask = ({ title, message = "", value = null, ok = "OK", danger = false }) =>
    new Promise((resolve) => {
      const inp = value !== null
        ? h("input", { class: "m-in", type: "text", value, spellcheck: "false" })
        : null;
      const done = (v) => {
        modal.classList.remove("on");
        modal.replaceChildren();
        resolve(v);
      };
      const cancel = h("button", { class: "mbtn", text: "Annuler", onclick: () => done(null) });
      const okBtn = h("button", {
        class: "mbtn main" + (danger ? " danger" : ""), text: ok,
        onclick: () => done(inp ? inp.value.trim() || null : true),
      });
      const card = h("div", { class: "mcard" },
        h("h3", { text: title }),
        message ? h("p", { text: message }) : null,
        inp,
        h("div", { class: "mact" }, cancel, okBtn)
      );
      card.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") okBtn.click();
        if (e.key === "Escape") cancel.click();
      });
      modal.replaceChildren(card);
      modal.classList.add("on");
      (inp || okBtn).focus();
      inp && inp.select();
    });

  // === Chargement ===
  let loadTimer;
  const setLoading = (on) => {
    clearTimeout(loadTimer);
    if (on) {
      prog.classList.add("show");
      progBar.style.transition = "none";
      progBar.style.width = "10%";
      requestAnimationFrame(() => {
        progBar.style.transition = "";
        progBar.style.width = "78%";
      });
    } else {
      progBar.style.width = "100%";
      loadTimer = setTimeout(() => {
        prog.classList.remove("show");
        progBar.style.transition = "none";
        progBar.style.width = "0";
      }, 350);
    }
  };

  // === Navigation ===
  let current = null;
  const sameSite = (a, b) => getDomain(a) === getDomain(b);

  const updateStar = () => {
    const saved = current && favs.some((f) => sameSite(f.url, current));
    btnStar.classList.toggle("on", !!saved);
  };

  function showHub() {
    current = null;
    win.classList.remove("full");
    frame.src = "about:blank";
    frame.classList.remove("on");
    hub.classList.remove("off");
    setLoading(false);
    input.value = "";
    titleMain.textContent = "FloatFrame";
    titleSub.textContent = "Ton hub de sites";
    render();
    updateStar();
  }

  function openUrl(u) {
    const full = normalizeUrl(u);
    current = full;
    hub.classList.add("off");
    frame.classList.add("on");
    setLoading(true);
    frame.src = full;
    input.value = full;
    const fav = favs.find((f) => sameSite(f.url, full));
    titleMain.textContent = fav ? fav.name : getDomain(full);
    titleSub.textContent = full;
    render();
    updateStar();
  }

  frame.addEventListener("load", () => { if (current) setLoading(false); });

  // === Focus clavier dans l'iframe (pour les jeux : Eaglercraft, etc.) ===
  const focusFrame = () => {
    try { frame.focus(); frame.contentWindow.focus(); } catch {}
  };
  frame.addEventListener("load", () => setTimeout(focusFrame, 100));
  stage.addEventListener("pointerdown", focusFrame);
  stage.addEventListener("mouseenter", () => { if (current) focusFrame(); });

  // === Gestion des favoris ===
  function removeFav(i) {
    const [r] = favs.splice(i, 1);
    persist();
    toast(`${r.name} retiré`);
    render();
    updateStar();
  }

  async function addFromInput() {
    const raw = input.value.trim();
    if (!raw) { toast("Colle d'abord un lien"); input.focus(); return; }
    if (!isValid(raw)) { toast("Lien invalide"); return; }
    const full = normalizeUrl(raw);
    if (favs.some((f) => sameSite(f.url, full))) { toast("Déjà dans ton hub"); return; }
    const name = await ask({
      title: "Nom du site", message: getDomain(full),
      value: guessName(getDomain(full)), ok: "Ajouter",
    });
    if (!name) return;
    favs.push({ name, url: full });
    persist();
    toast("Ajouté au hub ✓");
    render();
    updateStar();
  }

  // === Rendu ===
  function render() {
    // Onglets
    const home = h("button", { class: "chip home" + (current ? "" : " active"), onclick: showHub },
      ico(P.home, 14), h("span", { text: "Hub" }));
    tabs.replaceChildren(
      home,
      ...favs.map((fav, i) => {
        const x = h("span", { class: "x", title: "Retirer" }, ico(P.close, 11));
        x.addEventListener("click", (e) => { e.stopPropagation(); removeFav(i); });
        return h("button", {
          class: "chip" + (current && sameSite(current, fav.url) ? " active" : ""),
          title: fav.url, onclick: () => openUrl(fav.url),
        }, makeIcon(fav, 20), h("span", { text: fav.name }), x);
      })
    );

    // Hub
    const resetBtn = h("button", {
      class: "ghost",
      onclick: async () => {
        const yes = await ask({
          title: "Réinitialiser le hub ?",
          message: "Tes sites seront remplacés par la liste par défaut.",
          ok: "Réinitialiser", danger: true,
        });
        if (!yes) return;
        favs = DEFAULT_SITES.map((s) => ({ ...s }));
        persist();
        render();
        updateStar();
        toast("Hub réinitialisé");
      },
    }, ico(P.reset, 13), h("span", { text: "Réinitialiser" }));

    const head = h("div", { class: "hub-head" },
      h("div", {},
        h("h2", { text: "Ton hub" }),
        h("p", { text: `${favs.length} site${favs.length > 1 ? "s" : ""} · clique pour ouvrir` })
      ),
      resetBtn
    );

    const cards = favs.map((fav, i) => {
      const rm = h("button", { class: "rm", title: "Retirer" }, ico(P.close, 12));
      rm.addEventListener("click", (e) => { e.stopPropagation(); removeFav(i); });
      const card = h("div", { class: "card", role: "button", tabindex: "0" },
        rm, makeIcon(fav, 54),
        h("div", { class: "nm", text: fav.name }),
        h("div", { class: "dm", text: getDomain(fav.url) })
      );
      card.style.setProperty("--i", i);
      card.addEventListener("click", () => openUrl(fav.url));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") openUrl(fav.url); });
      return card;
    });

    const addTile = h("button", { class: "card add", onclick: () => input.focus() },
      h("div", { class: "plus" }, ico(P.plus, 22)),
      h("div", { class: "nm", text: "Ajouter un site" }),
      h("div", { class: "dm", text: "Colle un lien en haut" })
    );
    addTile.style.setProperty("--i", favs.length);

    hub.replaceChildren(head, h("div", { class: "grid" }, ...cards, addTile));
  }

  // === Actions ===
  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    if (!isValid(v)) { toast("Lien invalide"); return; }
    openUrl(v);
  };
  btnGo.onclick = go;
  ["keydown", "keyup", "keypress"].forEach((t) =>
    input.addEventListener(t, (e) => {
      e.stopPropagation();
      if (t === "keydown" && e.key === "Enter") go();
    })
  );
  btnHome.onclick = showHub;
  btnReload.onclick = () => {
    if (!current) { toast("Ouvre d'abord un site"); return; }
    setLoading(true);
    frame.src = current;
  };
  btnStar.onclick = () => {
    if (current && favs.some((f) => sameSite(f.url, current))) { toast("Déjà dans ton hub"); return; }
    addFromInput();
  };

  // Page entière : la fenêtre prend toute la page, sans barre de titre ni favoris
  const setFull = (on) => {
    win.classList.toggle("full", on);
    setTimeout(focusFrame, 50);
  };
  btnFull.onclick = () => {
    if (!current) { toast("Ouvre d'abord un site"); return; }
    setFull(true);
  };
  btnExit.onclick = () => setFull(false);
  document.addEventListener("keydown", (e) => {
    if (host.isConnected && e.key === "Escape" && win.classList.contains("full")) setFull(false);
  });

  // Réduire / agrandir / fermer
  btnMin.onclick = () => { win.classList.add("hidden"); bubble.classList.add("on"); };
  bubble.onclick = () => { win.classList.remove("hidden"); bubble.classList.remove("on"); };
  btnClose.onclick = () => host.remove();

  const toggleMax = () => {
    const m = win.classList.toggle("max");
    btnMax.replaceChildren(ico(m ? P.restore : P.max, 14));
    btnMax.title = m ? "Restaurer" : "Agrandir";
  };
  btnMax.onclick = toggleMax;
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest(".wb")) toggleMax(); });

  // === Déplacement ===
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".wb") || win.classList.contains("max")) return;
    const r = win.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.setPointerCapture(e.pointerId);
    win.classList.add("busy");
    bar.classList.add("grabbing");
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const x = Math.min(Math.max(e.clientX - drag.dx, -win.offsetWidth + 120), innerWidth - 120);
    const y = Math.min(Math.max(e.clientY - drag.dy, 0), innerHeight - 48);
    win.style.left = x + "px";
    win.style.top = y + "px";
  });
  const endDrag = () => { drag = null; win.classList.remove("busy"); bar.classList.remove("grabbing"); };
  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);

  // === Redimensionnement ===
  let rs = null;
  grip.addEventListener("pointerdown", (e) => {
    if (win.classList.contains("max")) return;
    rs = { x: e.clientX, y: e.clientY, w: win.offsetWidth, h: win.offsetHeight };
    grip.setPointerCapture(e.pointerId);
    win.classList.add("busy");
    e.preventDefault();
  });
  grip.addEventListener("pointermove", (e) => {
    if (!rs) return;
    win.style.width = Math.max(380, rs.w + e.clientX - rs.x) + "px";
    win.style.height = Math.max(300, rs.h + e.clientY - rs.y) + "px";
  });
  const endResize = () => { rs = null; win.classList.remove("busy"); };
  grip.addEventListener("pointerup", endResize);
  grip.addEventListener("pointercancel", endResize);

  // === Démarrage : le hub s'affiche, aucun site n'est ouvert ===
  render();
  updateStar();
})();
