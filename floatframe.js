(() => {
  const STORAGE_KEY = "__floatFrameFavorites";
  const SITES_URL = "https://raw.githubusercontent.com/hugu641/ConsChromeGame/refs/heads/main/sites.json";
  const CASINO_URL = "https://raw.githubusercontent.com/hugu641/ConsChromeGame/refs/heads/main/casino.js";
  const API_URL = "https://floatframe-casino.hug6314.workers.dev";
  const REMOTE_KEY = "__floatFrameRemote"; // domaines venant de sites.json
  const REFRESH_MS = 2 * 60 * 1000; // mise à jour du JSON toutes les 2 min
  const ADBLOCK_KEY = "__floatFrameAdblock";
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
      else if (v === false || v == null) continue; // attribut booléen désactivé (évite disabled="false")
      else if (v === true) el.setAttribute(k, "");
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
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    edit: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
    bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.6 1.4 4.8 3.5 6h7c2.1-1.2 3.5-3.4 3.5-6a7 7 0 0 0-7-7z",
    send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
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
      if (Array.isArray(saved)) {
        return saved.map((s) => ({
          name: s.name || "Site",
          url: s.url || "",
          folder: s.folder || s.category || "Favoris",
        }));
      }
    } catch {}
    return [];
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
@keyframes fade{from{opacity:0}to{opacity:1}}

.win{--bg:rgba(15,17,26,.94);--line:rgba(255,255,255,.08);--txt:#eef0f8;--mut:#8b90a8;--a1:#7c5cff;--a2:#00d4ff;
  position:fixed;top:70px;left:70px;width:700px;height:520px;min-width:min(380px,100vw);min-height:300px;max-width:100vw;max-height:100vh;
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

.tabs{display:flex;align-items:center;gap:6px;padding:7px 12px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.05)}
.tabs::-webkit-scrollbar{display:none}
.tab-chip{display:flex;align-items:center;gap:6px;max-width:180px;min-width:64px;padding:5px 9px;border-radius:10px;white-space:nowrap;flex-shrink:0;font-size:12px;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--mut);transition:.15s;user-select:none}
.tab-chip:hover{background:rgba(255,255,255,.1);color:#fff;transform:translateY(-1px)}
.tab-chip.active{background:linear-gradient(135deg,rgba(124,92,255,.38),rgba(0,212,255,.22));border-color:rgba(124,92,255,.7);color:#fff;box-shadow:0 2px 12px rgba(124,92,255,.25)}
.tab-chip .tab-ttl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:550}
.tab-chip .tab-x{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;color:var(--mut);opacity:.6;margin-left:3px;transition:.12s;flex-shrink:0}
.tab-chip:hover .tab-x{opacity:1}
.tab-chip .tab-x:hover{background:#ff4d63;color:#fff}
.tab-add{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;color:var(--mut);background:rgba(255,255,255,.04);border:1px solid var(--line);cursor:pointer;flex-shrink:0;transition:.15s}
.tab-add:hover{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.2);transform:scale(1.05)}
.eco-badge{margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:600;color:#3ddc97;background:rgba(61,220,151,.1);border:1px solid rgba(61,220,151,.25);flex-shrink:0;user-select:none}

.addr{display:flex;align-items:center;gap:8px;padding:2px 12px 10px;flex-shrink:0}
.btn{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;flex-shrink:0;color:#c9cde0;
  background:rgba(255,255,255,.055);border:1px solid var(--line);transition:.15s}
.btn:hover{background:rgba(255,255,255,.12);color:#fff;transform:translateY(-1px)}
.btn.on{color:#ffc542;background:rgba(255,197,66,.12);border-color:rgba(255,197,66,.4)}
.btn.on svg{fill:#ffc542}
.btn.req:hover{color:#fff;background:rgba(124,92,255,.2);border-color:rgba(124,92,255,.5)}
.btn.shield.on{color:#3ddc97;background:rgba(61,220,151,.12);border-color:rgba(61,220,151,.4)}
.btn.shield.on svg{fill:none}
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
.casino{display:none;flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
.casino.on{display:block}
.hub-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}
.hub-head h2{margin:0;font-size:22px;font-weight:750;letter-spacing:-.3px;
  background:linear-gradient(90deg,#fff,#b9a8ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.hub-head p{margin:4px 0 0;color:var(--mut);font-size:12px}
.ghost{display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:10px;font-size:12px;color:var(--mut);
  border:1px solid var(--line);background:rgba(255,255,255,.04);transition:.15s;flex-shrink:0}
.ghost:hover{color:#fff;background:rgba(255,255,255,.1)}

/* Hub search & folder organization */
.hub-toolbar{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}
.hub-search-box{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:12px;
  background:rgba(0,0,0,.35);border:1px solid var(--line);color:var(--mut);transition:.2s}
.hub-search-box:focus-within{border-color:rgba(124,92,255,.8);box-shadow:0 0 0 3px rgba(124,92,255,.2);color:#fff}
.hub-search-in{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--txt);font-size:13px}
.hub-search-in::placeholder{color:#6b7090}
.hub-search-clear{width:22px;height:22px;border-radius:50%;display:none;place-items:center;color:var(--mut);background:rgba(255,255,255,.08);font-size:11px}
.hub-search-clear.on{display:grid}
.hub-search-clear:hover{background:#ff4d63;color:#fff}
.hub-search-badge{font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.08);color:var(--mut);flex-shrink:0}

.folder-pills{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.folder-pills::-webkit-scrollbar{display:none}
.folder-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;font-size:12px;
  white-space:nowrap;background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--mut);transition:.15s;cursor:pointer}
.folder-pill:hover{color:#fff;background:rgba(255,255,255,.1)}
.folder-pill.active{color:#fff;background:linear-gradient(135deg,rgba(124,92,255,.35),rgba(0,212,255,.2));
  border-color:rgba(124,92,255,.7);box-shadow:0 2px 10px rgba(124,92,255,.25)}
.folder-pill .cnt{font-size:10.5px;padding:1px 6px;border-radius:999px;background:rgba(0,0,0,.35);color:inherit}

.folder-sec{margin-bottom:24px}
.folder-sec:last-child{margin-bottom:8px}
.folder-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.06)}
.folder-sec-title{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;color:#fff}
.folder-sec-badge{font-size:11px;font-weight:500;color:var(--mut);padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.06)}
.folder-sec-btn{font-size:11.5px;color:var(--mut);padding:4px 8px;border-radius:6px;transition:.15s}
.folder-sec-btn:hover{color:#fff;background:rgba(255,255,255,.08)}

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
.card .folder-tag{margin-top:2px;font-size:10px;color:var(--mut);padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.06);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .rm{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
  color:var(--mut);background:rgba(0,0,0,.35);opacity:0;transform:scale(.8);transition:.15s}
.card:hover .rm{opacity:1;transform:none}
.card .rm:hover{background:#ff4d63;color:#fff}
.card .rq{position:absolute;top:8px;right:34px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
  color:var(--mut);background:rgba(0,0,0,.35);opacity:0;transform:scale(.8);transition:.15s}
.card:hover .rq{opacity:1;transform:none}
.card .rq:hover{background:linear-gradient(135deg,var(--a1),var(--a2));color:#fff}
.card .ed{position:absolute;top:8px;left:8px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
  color:var(--mut);background:rgba(0,0,0,.35);opacity:0;transform:scale(.8);transition:.15s}
.card:hover .ed{opacity:1;transform:none}
.card .ed:hover{background:var(--a1);color:#fff}
.card.add{justify-content:center;background:transparent;border:1.5px dashed rgba(255,255,255,.18);color:var(--mut)}
.card.add:hover{color:#fff;border-color:rgba(124,92,255,.8)}
.plus{width:54px;height:54px;border-radius:28%;display:grid;place-items:center;background:rgba(255,255,255,.06);margin-bottom:4px}

.search-empty{padding:36px 16px;text-align:center;color:var(--mut)}
.search-empty svg{margin:0 auto 10px;opacity:.5;display:block}
.search-empty h3{margin:0 0 6px;font-size:15px;color:var(--txt)}
.search-empty p{margin:0 0 14px;font-size:12px}

.ico{display:grid;place-items:center;border-radius:28%;color:#fff;font-weight:800;flex-shrink:0;overflow:hidden;user-select:none}
.ico.has-img{background:#fff}
.ico img{width:62%;height:62%;object-fit:contain;display:block}

.frame{display:none;flex:1;width:100%;border:0;background:#fff}
.frame.on{display:block}

.grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;z-index:5;touch-action:none;
  background:linear-gradient(135deg,transparent 52%,rgba(255,255,255,.35) 52%,rgba(255,255,255,.35) 58%,transparent 58%,transparent 70%,rgba(255,255,255,.35) 70%,rgba(255,255,255,.35) 76%,transparent 76%)}
.win.max .grip{display:none}

.modal{position:absolute;inset:0;display:none;align-items:flex-start;justify-content:center;padding:12px 10px;background:rgba(6,7,12,.75);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:40;overflow-y:auto;scrollbar-width:thin}
.modal.on{display:flex;animation:fade .18s}
.mcard{width:min(420px,94%);max-height:calc(100% - 10px);margin:auto;display:flex;flex-direction:column;padding:16px 18px;border-radius:16px;background:#171a27;border:1px solid var(--line);
  box-shadow:0 24px 60px rgba(0,0,0,.7);animation:pop .22s cubic-bezier(.2,.9,.3,1.2);overflow-y:auto;scrollbar-width:thin}
.mcard h3{margin:0 0 4px;font-size:15px;flex-shrink:0}
.mcard p{margin:0 0 10px;color:var(--mut);font-size:12px;word-break:normal;overflow-wrap:break-word;line-height:1.35;flex-shrink:0}
.m-in{width:100%;height:34px;padding:0 10px;border-radius:9px;background:rgba(0,0,0,.35);border:1px solid var(--line);
  color:var(--txt);font-size:12.5px;outline:0;margin-bottom:8px;flex-shrink:0}
.m-in:focus{border-color:rgba(124,92,255,.8);box-shadow:0 0 0 3px rgba(124,92,255,.22)}
.mact{display:flex;justify-content:flex-end;gap:8px;margin-top:6px;flex-shrink:0;position:sticky;bottom:-2px;background:#171a27;padding:6px 0 2px}
.mbtn{padding:7px 13px;border-radius:9px;font-size:12px;color:var(--mut);background:rgba(255,255,255,.06);transition:.15s}
.mbtn:hover{color:#fff;background:rgba(255,255,255,.12)}
.mbtn.main{color:#fff;font-weight:600;background:linear-gradient(135deg,var(--a1),var(--a2))}
.mbtn.main:hover{filter:brightness(1.12)}
.mbtn.danger{background:linear-gradient(135deg,#ff4d63,#ff7a45)}

.toast{position:absolute;left:50%;bottom:18px;transform:translate(-50%,16px);padding:9px 16px;border-radius:999px;
  background:rgba(30,33,48,.96);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.45);
  font-size:12.5px;opacity:0;pointer-events:none;transition:.25s;z-index:50;white-space:nowrap}
.toast.on{opacity:1;transform:translate(-50%,0)}

/* Bouton réduit : zone cachée en haut au centre, le bouton apparaît au survol */
.bubble{position:fixed;top:0;left:50%;transform:translateX(-50%);width:180px;height:30px;display:none;padding:0;
  background:none;border:0;cursor:pointer;color:#fff}
.bubble.on{display:block}
.bubble::before{content:"";position:absolute;top:0;left:50%;width:40px;height:3px;transform:translateX(-50%);
  border-radius:0 0 4px 4px;background:rgba(255,255,255,.25);transition:opacity .2s}
.bubble:hover::before,.bubble:focus-visible::before{opacity:0}
.bubble .pill{position:absolute;top:0;left:50%;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;
  background:linear-gradient(135deg,#7c5cff,#00d4ff);box-shadow:0 10px 30px rgba(124,92,255,.5);
  transform:translate(-50%,-130%);opacity:0;pointer-events:none;
  transition:transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .2s}
.bubble:hover .pill,.bubble:focus-visible .pill{transform:translate(-50%,10px);opacity:1;pointer-events:auto}
.bubble:active .pill{transform:translate(-50%,10px) scale(.94)}
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

    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.onload = () => {
      if (img.naturalWidth > 1 && img.naturalHeight > 1) {
        box.textContent = "";
        box.style.background = "";
        box.classList.add("has-img");
        box.append(img);
      }
    };
    img.onerror = () => {
      // En cas d'indisponibilité, la lettre colorée stylisée reste affichée proprement
    };
    img.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
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
  const btnStar = h("button", { class: "btn", title: "Ajouter au hub (Admin)" }, ico(P.star, 17));
  const btnReq = h("button", { class: "btn req", title: "Proposer ce site en favori (Request Discord)" }, ico(P.send, 15));
  const btnShield = h("button", { class: "btn shield", title: "Anti-pub (Alt+A)" }, ico(P.shield, 16));
  const btnFull = h("button", { class: "btn", title: "Page entière (Alt+Z)" }, ico(P.full, 16));
  const btnExit = h("button", { class: "exitfs", title: "Quitter (Échap)" }, ico(P.exitfull, 18));
  const addr = h("div", { class: "addr" },
    btnHome, btnReload,
    h("div", { class: "url" }, ico(P.link, 15), input, btnGo),
    btnStar, btnReq, btnShield, btnFull
  );

  // Contenu
  const hub = h("div", { class: "hub" });
  const casinoPane = h("div", { class: "casino" });
  const frame = h("iframe", { class: "frame" });

  // === Toutes les permissions pour jouer (caméra, micro, manette, plein écran...) ===
  frame.setAttribute(
    "allow",
    [
      "camera *", "microphone *", "geolocation *", "fullscreen *", "autoplay *",
      "clipboard-read *", "clipboard-write *", "display-capture *",
      "encrypted-media *", "picture-in-picture *", "screen-wake-lock *",
      "gamepad *", "midi *", "accelerometer *", "gyroscope *",
      "magnetometer *", "xr-spatial-tracking *", "web-share *",
      "payment *", "publickey-credentials-get *", "storage-access *",
    ].join("; ")
  );

  // === Anti-pub : sandbox sans allow-popups / allow-top-navigation (bloque popups et redirections) ===
  const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-modals allow-downloads allow-presentation allow-orientation-lock";
  let adblock = true;
  try { adblock = localStorage.getItem(ADBLOCK_KEY) !== "0"; } catch {}
  const applyAdblock = () => {
    if (adblock) frame.setAttribute("sandbox", SANDBOX);
    else frame.removeAttribute("sandbox");
    btnShield.classList.toggle("on", adblock);
    btnShield.title = "Anti-pub " + (adblock ? "activé" : "désactivé") + " (Alt+A)";
  };
  applyAdblock();

  const stage = h("div", { class: "stage" }, hub, casinoPane, frame);

  const grip = h("div", { class: "grip" });
  const modal = h("div", { class: "modal" });
  const toastEl = h("div", { class: "toast" });
  win.append(bar, prog, tabs, addr, stage, grip, modal, toastEl, btnExit);

  // Bouton réduit : discret, apparaît en haut au centre au survol
  const bubble = h("button", { class: "bubble", title: "Rouvrir FloatFrame (Alt+M)" },
    h("span", { class: "pill" }, ico(P.globe, 22)));

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

  // === Système Multi-Onglets Optimisé (Zero Ressource) ===
  // Quand un onglet n'est pas actif/ouvert, son iframe est déchargée (src = "about:blank").
  // Zéro script, zéro WebGL, zéro audio en arrière-plan -> zéro ressource CPU/GPU consommée.
  let openTabs = [
    { id: "tab-1", type: "hub", name: "Hub", url: "" }
  ];
  let activeTabId = "tab-1";
  let tabIdCounter = 1;

  const getActiveTab = () => openTabs.find((t) => t.id === activeTabId) || openTabs[0];

  let current = null;
  const sameSite = (a, b) => {
    if (!a || !b) return false;
    return getDomain(a) === getDomain(b);
  };

  const updateStar = () => {
    const saved = current && favs.some((f) => sameSite(f.url, current));
    btnStar.classList.toggle("on", !!saved);
  };

  let casinoOn = false;
  let casinoMod = null;

  function createTab({ type = "hub", name = "Hub", url = "" } = {}, makeActive = true) {
    tabIdCounter++;
    const newTab = { id: "tab-" + tabIdCounter, type, name, url };
    openTabs.push(newTab);
    if (makeActive) {
      switchTab(newTab.id);
    } else {
      renderTabs();
    }
    return newTab;
  }

  function closeTab(tabId, e) {
    if (e) e.stopPropagation();
    const idx = openTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    if (openTabs.length === 1) {
      // Dernier onglet : on le réinitialise sur le Hub
      openTabs[0].type = "hub";
      openTabs[0].name = "Hub";
      openTabs[0].url = "";
      switchTab(openTabs[0].id);
      return;
    }

    const wasActive = activeTabId === tabId;
    openTabs.splice(idx, 1);

    if (wasActive) {
      const nextIdx = Math.max(0, idx - 1);
      switchTab(openTabs[nextIdx].id);
    } else {
      renderTabs();
    }
  }

  async function switchTab(tabId) {
    const target = openTabs.find((t) => t.id === tabId);
    if (!target) return;

    // Déchargement immédiat de l'iframe : aucune ressource gaspillée en tâche de fond
    frame.src = "about:blank";
    frame.classList.remove("on");
    hub.classList.add("off");
    casinoPane.classList.remove("on");

    activeTabId = tabId;

    if (target.type === "hub") {
      current = null;
      casinoOn = false;
      win.classList.remove("full");
      hub.classList.remove("off");
      setLoading(false);
      input.value = "";
      titleMain.textContent = "FloatFrame";
      titleSub.textContent = "Ton hub de sites";
    } else if (target.type === "casino") {
      current = null;
      casinoOn = true;
      win.classList.remove("full");
      casinoPane.classList.add("on");
      setLoading(false);
      input.value = "";
      titleMain.textContent = "Casino";
      titleSub.textContent = "Monnaie virtuelle · jeux gérés par le serveur";
      try {
        if (!casinoMod) {
          const r = await fetch(CASINO_URL + "?t=" + Date.now(), { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          casinoMod = new Function("ctx", await r.text())({ h, toast, ask, pane: casinoPane });
        }
        if (casinoOn) await casinoMod.open();
      } catch (e) {
        casinoMod = null;
        casinoPane.replaceChildren(h("p", { style: "padding:24px;text-align:center;color:#ff5d73", text: "Casino indisponible : " + (e.message || e) }));
      }
    } else {
      // Type "site" : seul l'onglet actif est chargé dans l'iframe
      current = target.url;
      casinoOn = false;
      frame.classList.add("on");
      setLoading(true);
      frame.src = target.url; // Chargement optimisé à la demande
      input.value = target.url;
      titleMain.textContent = target.name;
      titleSub.textContent = target.url;
    }

    renderTabs();
    renderHub();
    updateStar();
  }

  function showHub() {
    const hubTab = openTabs.find((t) => t.type === "hub");
    if (hubTab) {
      switchTab(hubTab.id);
    } else {
      createTab({ type: "hub", name: "Hub", url: "" }, true);
    }
  }

  function openCasino() {
    const casTab = openTabs.find((t) => t.type === "casino");
    if (casTab) {
      switchTab(casTab.id);
    } else {
      createTab({ type: "casino", name: "Casino", url: "" }, true);
    }
  }

  function openUrl(u) {
    const full = normalizeUrl(u);
    const fav = favs.find((f) => sameSite(f.url, full));
    const name = fav ? fav.name : guessName(getDomain(full));

    // Si cet onglet est déjà ouvert, bascule directement dessus
    const existing = openTabs.find((t) => t.type === "site" && sameSite(t.url, full));
    if (existing) {
      existing.name = name;
      existing.url = full;
      switchTab(existing.id);
      return;
    }

    const cur = getActiveTab();
    // Si l'onglet en cours est un Hub et qu'il n'y a qu'1 seul onglet au total, on l'utilise
    if (cur && cur.type === "hub" && openTabs.length === 1) {
      cur.type = "site";
      cur.name = name;
      cur.url = full;
      switchTab(cur.id);
      return;
    }

    // Sinon, on ouvre dans un nouvel onglet optimisé
    createTab({ type: "site", name, url: full }, true);
  }

  frame.addEventListener("load", () => { if (current) setLoading(false); });

  // === Focus clavier dans l'iframe (pour les jeux : Eaglercraft, etc.) ===
  const focusFrame = () => {
    try { frame.focus(); frame.contentWindow.focus(); } catch {}
  };
  frame.addEventListener("load", () => setTimeout(focusFrame, 100));
  stage.addEventListener("pointerdown", focusFrame);
  stage.addEventListener("mouseenter", () => { if (current) focusFrame(); });

  // === Gestion des favoris & dossiers ===
  let searchQuery = "";
  let selectedFolder = "ALL";

  const cleanStr = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const getFolderList = () => {
    const list = Array.from(new Set(favs.map((f) => f.folder || "Favoris"))).filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, "fr"));
  };

  const folderEmoji = (fName) => {
    const fn = cleanStr(fName);
    if (fn.includes("zombie") || fn.includes("cod") || fn.includes("duty")) return "🧟";
    if (fn.includes("fps") || fn.includes("retro") || fn.includes("shoot") || fn.includes("classique")) return "🎯";
    if (fn.includes("gta") || fn.includes("world") || fn.includes("monde")) return "🚗";
    if (fn.includes("course") || fn.includes("glisse") || fn.includes("sport") || fn.includes("skate") || fn.includes("kart")) return "🏎️";
    if (fn.includes("roblox") || fn.includes("multi")) return "👥";
    if (fn.includes("stream") || fn.includes("outil") || fn.includes("util") || fn.includes("anime")) return "🎬";
    return "📁";
  };

  const askSite = ({ title = "Favori", name = "", url = "", folder = "Favoris", isEdit = false }) =>
    new Promise((resolve) => {
      const urlInp = isEdit ? h("input", { class: "m-in", type: "text", value: url, spellcheck: "false", placeholder: "https://..." }) : null;
      const nameInp = h("input", { class: "m-in", type: "text", value: name, spellcheck: "false", placeholder: "Nom du site" });
      const folderInp = h("input", { class: "m-in", type: "text", value: folder, spellcheck: "false", placeholder: "Nom du dossier" });

      const done = (val) => {
        modal.classList.remove("on");
        modal.replaceChildren();
        resolve(val);
      };

      const cancel = h("button", { class: "mbtn", text: "Annuler", onclick: () => done(null) });
      const okBtn = h("button", {
        class: "mbtn main", text: isEdit ? "Enregistrer" : "Ajouter",
        onclick: () => {
          const n = nameInp.value.trim();
          const f = folderInp.value.trim() || "Favoris";
          const u = urlInp ? urlInp.value.trim() : url;
          if (!n) { nameInp.focus(); return; }
          if (urlInp && (!u || !isValid(u))) { toast("Lien invalide"); urlInp.focus(); return; }
          done({ name: n, folder: f, url: u ? normalizeUrl(u) : url });
        },
      });

      const existingFolders = getFolderList();
      const folderPills = existingFolders.length > 0
        ? h("div", { style: "display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px" },
            ...existingFolders.map((fName) =>
              h("button", {
                class: "ghost",
                type: "button",
                style: "padding:3px 8px;font-size:11px",
                text: `${folderEmoji(fName)} ${fName}`,
                onclick: () => { folderInp.value = fName; },
              })
            )
          )
        : null;

      const fields = [
        h("h3", { text: title }),
        isEdit ? h("div", {}, h("label", { style: "display:block;font-size:11px;color:var(--mut);margin-bottom:3px", text: "URL" }), urlInp) : null,
        h("label", { style: "display:block;font-size:11px;color:var(--mut);margin-bottom:3px", text: "Nom du site" }),
        nameInp,
        h("label", { style: "display:block;font-size:11px;color:var(--mut);margin-bottom:3px", text: "Dossier / Fichier de rangement" }),
        folderInp,
        folderPills,
        h("div", { class: "mact" }, cancel, okBtn),
      ];

      const card = h("div", { class: "mcard" }, ...fields.filter(Boolean));
      card.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") okBtn.click();
        if (e.key === "Escape") cancel.click();
      });

      modal.replaceChildren(card);
      modal.classList.add("on");
      (nameInp || urlInp).focus();
      (nameInp || urlInp).select();
    });

  function removeFav(fav) {
    const idx = favs.indexOf(fav);
    if (idx === -1) return;
    const [r] = favs.splice(idx, 1);
    persist();
    toast(`${r.name} retiré`);
    render();
    updateStar();
  }

  async function addFromInput() {
    const raw = input.value.trim() || (current && !favs.some((f) => sameSite(f.url, current)) ? current : "");
    if (!raw) { toast("Colle d'abord un lien en haut"); input.focus(); return; }
    if (!isValid(raw)) { toast("Lien invalide"); return; }
    const full = normalizeUrl(raw);
    if (favs.some((f) => sameSite(f.url, full))) { toast("Déjà dans ton hub"); return; }

    const name = guessName(getDomain(full));
    const folder = selectedFolder !== "ALL" ? selectedFolder : "Jeux";

    // Ajout direct au hub sans demander
    favs.push({ name, url: full, folder });
    persist();
    render();
    updateStar();
    input.value = "";

    // Envoi direct à Discord en tant qu'administrateur
    try {
      fetch(API_URL + "/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          url: full,
          folder,
          author: "Admin 👑",
          notes: "Ajouté directement depuis la barre d'adresse",
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.discordSent) {
            toast(`⭐ ${name} ajouté & envoyé sur Discord (Admin) ✓`);
          } else {
            toast(`⭐ ${name} ajouté au hub ✓`);
          }
        })
        .catch(() => {
          toast(`⭐ ${name} ajouté au hub ✓`);
        });
    } catch {
      toast(`⭐ ${name} ajouté au hub ✓`);
    }
  }

  // Envoi direct d'une requête de favori vers Discord
  async function sendSiteRequest(site) {
    toast(`Envoi de "${site.name}" sur Discord...`);
    try {
      const r = await fetch(API_URL + "/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: site.name,
          url: site.url,
          folder: site.folder || "Favoris",
          author: "Joueur FloatFrame",
          notes: "Demande de favori envoyée depuis FloatFrame",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Erreur HTTP " + r.status);
      if (data.discordSent) {
        toast(`Demande pour "${site.name}" reçue sur Discord ✓`);
      } else {
        toast(`Demande pour "${site.name}" enregistrée ✓`);
      }
    } catch (err) {
      toast(`Erreur envoi Discord : ${err.message || err}`);
    }
  }

  // Modale compacte et scrollable pour proposer un site à l'administrateur
  const askSuggest = (init = {}) =>
    new Promise((resolve) => {
      const curTab = getActiveTab();
      const currentUrl = (curTab && curTab.type === "site" && curTab.url) ? curTab.url : (current || "");
      const rawInp = input.value.trim();
      const targetUrl = init.url || (rawInp && isValid(rawInp) ? normalizeUrl(rawInp) : currentUrl);
      const fav = targetUrl ? favs.find((f) => sameSite(f.url, targetUrl)) : null;
      const targetName = init.name || (fav ? fav.name : (targetUrl ? guessName(getDomain(targetUrl)) : ""));
      const targetFolder = init.folder || (fav ? fav.folder : (selectedFolder !== "ALL" ? selectedFolder : "Jeux"));

      const nameInp = h("input", { class: "m-in", type: "text", value: targetName, spellcheck: "false", placeholder: "Nom du site / jeu (ex: Krunker)" });
      const urlInp = h("input", { class: "m-in", type: "text", value: targetUrl, spellcheck: "false", placeholder: "URL (ex: https://krunker.io)" });
      const folderInp = h("input", { class: "m-in", type: "text", value: targetFolder, spellcheck: "false", placeholder: "Dossier souhaité" });
      const authorInp = h("input", { class: "m-in", type: "text", spellcheck: "false", placeholder: "Ton pseudo ou Discord (optionnel)" });
      const notesInp = h("input", { class: "m-in", type: "text", spellcheck: "false", placeholder: "Note / commentaire pour l'admin (optionnel)" });
      const statusText = h("div", { style: "color:#ff5d73;font-size:11.5px;margin-bottom:8px;display:none" });

      const done = () => {
        modal.classList.remove("on");
        modal.replaceChildren();
        resolve();
      };

      const cancel = h("button", { class: "mbtn", text: "Annuler", onclick: done });
      const okBtn = h("button", {
        class: "mbtn main", text: "Envoyer à l'admin",
        onclick: async () => {
          const name = nameInp.value.trim();
          let url = urlInp.value.trim();
          const folder = folderInp.value.trim() || "Jeux";
          const author = authorInp.value.trim();
          const notes = notesInp.value.trim();

          if (!name) { nameInp.focus(); return; }
          if (!url) { urlInp.focus(); return; }
          if (!isValid(url)) {
            statusText.textContent = "Lien invalide (ex: monsite.com ou https://...)";
            statusText.style.display = "block";
            urlInp.focus();
            return;
          }
          url = normalizeUrl(url);

          okBtn.disabled = true;
          okBtn.textContent = "Envoi en cours...";
          statusText.style.display = "none";

          try {
            const r = await fetch(API_URL + "/api/suggest", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, url, folder, author, notes }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || "Erreur HTTP " + r.status);
            if (!data.discordConfigured) {
              toast("⚠️ Enregistré en base, mais DISCORD_WEBHOOK_URL non configuré");
            } else if (!data.discordSent) {
              toast("⚠️ Enregistré en base, mais Discord a échoué");
            } else {
              toast("Demande reçue sur Discord ✓");
            }
            done();
          } catch (err) {
            statusText.textContent = err.message || "Erreur de connexion au serveur.";
            statusText.style.display = "block";
            okBtn.disabled = false;
            okBtn.textContent = "Envoyer à l'admin";
          }
        },
      });

      const existingFolders = getFolderList();
      const folderPills = existingFolders.length > 0
        ? h("div", { style: "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px" },
            ...existingFolders.map((fName) =>
              h("button", {
                class: "ghost",
                type: "button",
                style: "padding:2px 7px;font-size:10.5px",
                text: `${folderEmoji(fName)} ${fName}`,
                onclick: () => { folderInp.value = fName; },
              })
            )
          )
        : null;

      const card = h("div", { class: "mcard", style: "max-width:390px;width:94%" },
        h("h3", { text: "💡 Proposer un site" }),
        h("p", { text: "Ta proposition sera envoyée directement sur Discord pour validation par l'administrateur." }),
        h("label", { style: "display:block;font-size:10.5px;color:var(--mut);margin-bottom:2px", text: "Nom du site / jeu" }),
        nameInp,
        h("label", { style: "display:block;font-size:10.5px;color:var(--mut);margin-bottom:2px", text: "Lien (URL)" }),
        urlInp,
        h("label", { style: "display:block;font-size:10.5px;color:var(--mut);margin-bottom:2px", text: "Dossier / Fichier souhaité" }),
        folderInp,
        folderPills,
        h("label", { style: "display:block;font-size:10.5px;color:var(--mut);margin-bottom:2px", text: "Ton pseudo ou Discord (optionnel)" }),
        authorInp,
        h("label", { style: "display:block;font-size:10.5px;color:var(--mut);margin-bottom:2px", text: "Commentaire / note (optionnel)" }),
        notesInp,
        statusText,
        h("div", { class: "mact" }, cancel, okBtn)
      );

      card.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && e.target.tagName === "INPUT") okBtn.click();
        if (e.key === "Escape") done();
      });

      modal.replaceChildren(card);
      modal.classList.add("on");
      (nameVal ? urlInp : nameInp).focus();
    });

  // Éléments du Hub
  const hubSubtitle = h("p");
  const resetBtn = h("button", {
    class: "ghost",
    title: "Réinitialiser les favoris",
    onclick: async () => {
      const yes = await ask({
        title: "Réinitialiser le hub ?",
        message: "Tes sites seront remplacés par la liste organisée de sites.json.",
        ok: "Réinitialiser", danger: true,
      });
      if (!yes) return;
      const list = await fetchSites();
      if (!list) { toast("Impossible de charger sites.json"); return; }
      favs = list.map((s) => ({ name: s.name, url: s.url, folder: s.folder || s.category || "Favoris" }));
      try { localStorage.setItem(REMOTE_KEY, JSON.stringify(favs.map((f) => getDomain(f.url)))); } catch {}
      persist();
      render();
      updateStar();
      toast("Hub réinitialisé avec les dossiers");
    },
  }, ico(P.reset, 13), h("span", { text: "Réinitialiser" }));

  const suggestBtn = h("button", {
    class: "ghost",
    title: "Proposer un nouveau site à l'administrateur (Discord)",
    onclick: askSuggest,
  }, ico(P.bulb, 13), h("span", { text: "Proposer un site" }));

  const hubHead = h("div", { class: "hub-head" },
    h("div", {}, h("h2", { text: "Ton hub" }), hubSubtitle),
    h("div", { style: "display:flex;align-items:center;gap:6px" }, suggestBtn, resetBtn)
  );

  const searchInput = h("input", {
    class: "hub-search-in",
    type: "text",
    placeholder: "Rechercher un site, un jeu, un dossier... (Raccourci: /)",
    spellcheck: "false",
    autocomplete: "off",
  });
  const searchClear = h("button", { class: "hub-search-clear", title: "Effacer la recherche" }, ico(P.close, 12));
  const searchBadge = h("span", { class: "hub-search-badge" });
  const searchBox = h("div", { class: "hub-search-box" }, ico(P.search, 15), searchInput, searchClear, searchBadge);
  const folderPillsWrap = h("div", { class: "folder-pills" });
  const hubToolbar = h("div", { class: "hub-toolbar" }, searchBox, folderPillsWrap);
  const hubContent = h("div", { class: "hub-content" });

  hub.replaceChildren(hubHead, hubToolbar, hubContent);

  // Recherche dynamique
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    searchClear.classList.toggle("on", !!searchQuery);
    renderHubContent();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClear.classList.remove("on");
    renderHubContent();
    searchInput.focus();
  });
  searchInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      if (searchInput.value) {
        searchInput.value = "";
        searchQuery = "";
        searchClear.classList.remove("on");
        renderHubContent();
      } else {
        searchInput.blur();
      }
    }
  });

  const makeCard = (fav, animIndex = 0) => {
    const rm = h("button", { class: "rm", title: "Retirer" }, ico(P.close, 12));
    rm.addEventListener("click", (e) => { e.stopPropagation(); removeFav(fav); });

    const rq = h("button", { class: "rq", title: "Envoyer en request favori sur Discord" }, ico(P.send, 11));
    rq.addEventListener("click", (e) => { e.stopPropagation(); sendSiteRequest(fav); });

    const ed = h("button", { class: "ed", title: "Modifier / Ranger dans un dossier" }, ico(P.edit, 12));
    ed.addEventListener("click", async (e) => {
      e.stopPropagation();
      const res = await askSite({
        title: "Modifier le favori",
        name: fav.name,
        url: fav.url,
        folder: fav.folder || "Favoris",
        isEdit: true,
      });
      if (!res) return;
      fav.name = res.name;
      fav.url = res.url;
      fav.folder = res.folder;
      persist();
      render();
      toast("Favori mis à jour ✓");
    });

    const card = h("div", { class: "card", role: "button", tabindex: "0" },
      ed, rq, rm,
      makeIcon(fav, 52),
      h("div", { class: "nm", text: fav.name }),
      h("div", { class: "dm", text: getDomain(fav.url) }),
      h("div", { class: "folder-tag", text: `${folderEmoji(fav.folder || "Favoris")} ${fav.folder || "Favoris"}` })
    );
    card.style.setProperty("--i", animIndex);
    card.addEventListener("click", () => openUrl(fav.url));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter") openUrl(fav.url); });
    return card;
  };

  const makeCasinoTile = (animIndex = 0) => {
    const tile = h("div", { class: "card", role: "button", tabindex: "0" },
      h("div", { class: "ico", style: "width:52px;height:52px;font-size:28px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(135deg,#ffc83d,#ff5d73)", text: "🎰" }),
      h("div", { class: "nm", text: "Casino" }),
      h("div", { class: "dm", text: "jetons virtuels" }),
      h("div", { class: "folder-tag", text: "🎲 Jeux & Jetons" })
    );
    tile.style.setProperty("--i", animIndex);
    tile.addEventListener("click", openCasino);
    tile.addEventListener("keydown", (e) => { if (e.key === "Enter") openCasino(); });
    return tile;
  };

  const makeSuggestTile = (animIndex = 0) => {
    const tile = h("div", { class: "card", role: "button", tabindex: "0" },
      h("div", { class: "ico", style: "width:52px;height:52px;font-size:26px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(135deg,#7c5cff,#00d4ff)", text: "💡" }),
      h("div", { class: "nm", text: "Proposer un site" }),
      h("div", { class: "dm", text: "Validation Discord" }),
      h("div", { class: "folder-tag", text: "🤝 Communauté" })
    );
    tile.style.setProperty("--i", animIndex);
    tile.addEventListener("click", askSuggest);
    tile.addEventListener("keydown", (e) => { if (e.key === "Enter") askSuggest(); });
    return tile;
  };

  const makeAddTile = (defaultFolder = "Favoris", animIndex = 0) => {
    const tile = h("button", {
      class: "card add",
      onclick: async () => {
        const res = await askSite({
          title: "Ajouter un site",
          name: "",
          url: "",
          folder: defaultFolder,
          isEdit: true,
        });
        if (!res) return;
        if (favs.some((f) => sameSite(f.url, res.url))) { toast("Déjà dans ton hub"); return; }
        favs.push({ name: res.name, url: res.url, folder: res.folder });
        persist();
        render();
        toast(`${res.name} ajouté au hub ✓`);
      },
    },
      h("div", { class: "plus" }, ico(P.plus, 22)),
      h("div", { class: "nm", text: "Ajouter un site" }),
      h("div", { class: "dm", text: "Nouveau lien" }),
      h("div", { class: "folder-tag", text: `📁 ${defaultFolder}` })
    );
    tile.style.setProperty("--i", animIndex);
    return tile;
  };

  function renderHubContent() {
    const q = cleanStr(searchQuery);

    if (q) {
      // Mode recherche active
      const matches = favs.filter((f) => {
        const n = cleanStr(f.name);
        const u = cleanStr(f.url);
        const d = cleanStr(getDomain(f.url));
        const fol = cleanStr(f.folder);
        return n.includes(q) || u.includes(q) || d.includes(q) || fol.includes(q);
      });

      searchBadge.textContent = `${matches.length} trouvé${matches.length > 1 ? "s" : ""}`;

      if (matches.length === 0) {
        const clearBtn = h("button", {
          class: "mbtn main",
          text: "Effacer la recherche",
          onclick: () => {
            searchInput.value = "";
            searchQuery = "";
            searchClear.classList.remove("on");
            renderHubContent();
            searchInput.focus();
          },
        });
        hubContent.replaceChildren(
          h("div", { class: "search-empty" },
            ico(P.search, 36),
            h("h3", { text: "Aucun résultat" }),
            h("p", { text: `Aucun favori ne correspond à "${searchQuery}".` }),
            clearBtn
          )
        );
        return;
      }

      const grid = h("div", { class: "grid" },
        ...matches.map((fav, i) => makeCard(fav, i))
      );
      const resHead = h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;color:var(--mut);font-size:12px" },
        h("span", { text: `Résultats pour "${searchQuery}" (${matches.length})` }),
        h("button", {
          class: "ghost",
          style: "padding:3px 8px;font-size:11px",
          text: "Effacer",
          onclick: () => {
            searchInput.value = "";
            searchQuery = "";
            searchClear.classList.remove("on");
            renderHubContent();
            searchInput.focus();
          },
        })
      );
      hubContent.replaceChildren(resHead, grid);
      return;
    }

    // Pas de recherche textuelle : affichage par dossiers
    searchBadge.textContent = `${favs.length} sites`;

    if (selectedFolder !== "ALL") {
      // Un seul dossier sélectionné
      const folderFavs = favs.filter((f) => (f.folder || "Favoris") === selectedFolder);
      const secHead = h("div", { class: "folder-sec-head" },
        h("div", { class: "folder-sec-title" },
          h("span", { text: `${folderEmoji(selectedFolder)} ${selectedFolder}` }),
          h("span", { class: "folder-sec-badge", text: `${folderFavs.length} site${folderFavs.length > 1 ? "s" : ""}` })
        ),
        h("button", {
          class: "ghost",
          style: "padding:4px 8px;font-size:11.5px",
          text: "← Voir tous les dossiers",
          onclick: () => {
            selectedFolder = "ALL";
            render();
          },
        })
      );
      const grid = h("div", { class: "grid" },
        ...folderFavs.map((fav, i) => makeCard(fav, i)),
        makeAddTile(selectedFolder, folderFavs.length)
      );
      hubContent.replaceChildren(h("div", { class: "folder-sec" }, secHead, grid));
      return;
    }

    // Affichage "Tous les dossiers" : groupé par dossier avec sections
    const folders = getFolderList();
    const sections = [];
    let animCount = 0;

    for (const fName of folders) {
      const folderFavs = favs.filter((f) => (f.folder || "Favoris") === fName);
      if (folderFavs.length === 0) continue;

      const secHead = h("div", { class: "folder-sec-head" },
        h("div", { class: "folder-sec-title" },
          h("span", { text: `${folderEmoji(fName)} ${fName}` }),
          h("span", { class: "folder-sec-badge", text: `${folderFavs.length}` })
        ),
        h("button", {
          class: "folder-sec-btn",
          text: "Filtrer ce dossier",
          onclick: () => {
            selectedFolder = fName;
            render();
          },
        })
      );

      const grid = h("div", { class: "grid" },
        ...folderFavs.map((fav) => makeCard(fav, animCount++))
      );

      sections.push(h("div", { class: "folder-sec" }, secHead, grid));
    }

    // Section Casino, Suggestions & Ajout
    const extraHead = h("div", { class: "folder-sec-head" },
      h("div", { class: "folder-sec-title" },
        h("span", { text: "🎲 Jeux, Suggestions & Nouveaux Sites" }),
        h("span", { class: "folder-sec-badge", text: "Communauté" })
      )
    );
    const extraGrid = h("div", { class: "grid" },
      makeCasinoTile(animCount++),
      makeSuggestTile(animCount++),
      makeAddTile("Favoris", animCount++)
    );
    sections.push(h("div", { class: "folder-sec" }, extraHead, extraGrid));

    hubContent.replaceChildren(...sections);
  }

  // === Rendu des Onglets Multi-Onglets Optimisés (Zéro Ressource) ===
  function renderTabs() {
    const tabChips = openTabs.map((tab) => {
      const isActive = tab.id === activeTabId;
      const x = h("span", { class: "tab-x", title: "Fermer l'onglet (Alt+W)" }, ico(P.close, 11));
      x.addEventListener("click", (e) => closeTab(tab.id, e));

      let tabIcon;
      if (tab.type === "hub") {
        tabIcon = ico(P.home, 13);
      } else if (tab.type === "casino") {
        tabIcon = h("span", { style: "font-size:13px;line-height:1" }, "🎰");
      } else {
        const dummyFav = { name: tab.name, url: tab.url };
        tabIcon = makeIcon(dummyFav, 16);
      }

      const chip = h("div", {
        class: "tab-chip" + (isActive ? " active" : ""),
        title: isActive
          ? `${tab.name} (Onglet actif)`
          : `${tab.name} (En veille ⚡ 0% ressource - clique pour réveiller)`,
        onclick: () => switchTab(tab.id),
      },
        tabIcon,
        h("span", { class: "tab-ttl", text: tab.name }),
        x
      );
      return chip;
    });

    const btnNewTab = h("button", {
      class: "tab-add",
      title: "Nouvel onglet (Hub) - Alt+T",
      onclick: () => createTab({ type: "hub", name: "Hub", url: "" }, true),
    }, ico(P.plus, 14));

    const ecoBadge = h("div", {
      class: "eco-badge",
      title: "Mode optimisé actif : les onglets en arrière-plan ne chargent aucun script ni WebGL (0% CPU / GPU)",
    }, ico(P.zap, 11), h("span", { text: "Éco 0%" }));

    tabs.replaceChildren(...tabChips, btnNewTab, ecoBadge);
  }

  // === Rendu du Hub ===
  function renderHub() {
    // Sous-titre du Hub
    const folders = getFolderList();
    hubSubtitle.textContent = `${favs.length} site${favs.length > 1 ? "s" : ""} dans ${folders.length} dossier${folders.length > 1 ? "s" : ""} · clique pour ouvrir`;

    // Filtres en pilules des dossiers
    const allPill = h("button", {
      class: "folder-pill" + (selectedFolder === "ALL" ? " active" : ""),
      onclick: () => {
        selectedFolder = "ALL";
        render();
      },
    }, h("span", { text: "📁 Tous" }), h("span", { class: "cnt", text: favs.length }));

    const pills = folders.map((fName) => {
      const count = favs.filter((f) => (f.folder || "Favoris") === fName).length;
      return h("button", {
        class: "folder-pill" + (selectedFolder === fName ? " active" : ""),
        onclick: () => {
          selectedFolder = fName;
          render();
        },
      }, h("span", { text: `${folderEmoji(fName)} ${fName}` }), h("span", { class: "cnt", text: count }));
    });

    folderPillsWrap.replaceChildren(allPill, ...pills);

    // Contenu du Hub
    renderHubContent();
  }

  // Rendu global
  function render() {
    renderTabs();
    renderHub();
  }

  // === Actions ===
  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    if (!isValid(v)) { toast("Lien invalide"); return; }
    const full = normalizeUrl(v);
    const fav = favs.find((f) => sameSite(f.url, full));
    const name = fav ? fav.name : guessName(getDomain(full));
    const cur = getActiveTab();
    if (cur && cur.type === "site") {
      cur.url = full;
      cur.name = name;
      current = full;
      setLoading(true);
      frame.src = full;
      titleMain.textContent = name;
      titleSub.textContent = full;
      renderTabs();
      updateStar();
    } else {
      openUrl(full);
    }
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
  btnReq.onclick = () => askSuggest();

  btnShield.onclick = () => {
    adblock = !adblock;
    try { localStorage.setItem(ADBLOCK_KEY, adblock ? "1" : "0"); } catch {}
    applyAdblock();
    toast(adblock ? "Anti-pub activé" : "Anti-pub désactivé");
    if (current) { setLoading(true); frame.src = current; }
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

  // === Favoris en temps réel : synchro entre onglets du même site ===
  window.addEventListener("storage", (e) => {
    if (!host.isConnected || e.key !== STORAGE_KEY) return;
    favs = readStorage();
    render();
    updateStar();
  });

  // === Synchro avec sites.json (GitHub) : au lancement puis toutes les 2 min ===
  async function fetchSites() {
    try {
      const r = await fetch(SITES_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) { console.error("[FloatFrame] HTTP", r.status, r.statusText); return null; }
      const list = await r.json();
      if (!Array.isArray(list)) { console.error("[FloatFrame] sites.json n'est pas un tableau:", list); return null; }
      return list.filter((s) => s && s.name && s.url);
    } catch (err) {
      console.error("[FloatFrame] fetch échoué (CSP, réseau ou JSON invalide):", err);
      return null;
    }
  }

  const syncRemote = async () => {
    const list = await fetchSites();
    if (!list) return;

    // Récupérer également les sites validés par l'admin depuis le serveur
    try {
      const apprRes = await fetch(API_URL + "/api/suggest/approved?t=" + Date.now(), { cache: "no-store" });
      if (apprRes.ok) {
        const apprData = await apprRes.json();
        if (Array.isArray(apprData?.approved)) {
          for (const s of apprData.approved) {
            if (s && s.name && s.url && !list.some((x) => sameSite(x.url, s.url))) {
              list.push({ name: s.name, url: s.url, folder: s.folder || "Jeux" });
            }
          }
        }
      }
    } catch {}

    let prev = [];
    try { prev = JSON.parse(localStorage.getItem(REMOTE_KEY)) || []; } catch {}
    const domains = list.map((s) => getDomain(s.url));

    let added = 0, updated = 0, removed = 0;

    // Ajoute les sites manquants, met à jour nom/lien/dossier des existants
    for (const s of list) {
      const folder = s.folder || s.category || "Favoris";
      const f = favs.find((x) => sameSite(x.url, s.url));
      if (!f) {
        favs.push({ name: s.name, url: s.url, folder });
        added++;
      } else {
        let changed = false;
        if (f.name !== s.name) { f.name = s.name; changed = true; }
        if (f.url !== s.url) { f.url = s.url; changed = true; }
        if (s.folder && (!f.folder || f.folder === "Favoris" || prev.includes(getDomain(f.url)))) {
          if (f.folder !== s.folder) { f.folder = s.folder; changed = true; }
        }
        if (changed) updated++;
      }
    }

    // Retire les sites qui venaient du JSON et n'y sont plus (tes sites perso restent)
    const before = favs.length;
    favs = favs.filter((f) => {
      const d = getDomain(f.url);
      return !(prev.includes(d) && !domains.includes(d));
    });
    removed = before - favs.length;

    try { localStorage.setItem(REMOTE_KEY, JSON.stringify(domains)); } catch {}

    if (added || updated || removed) {
      persist();
      render();
      updateStar();
      toast(`Hub mis à jour (+${added} / ~${updated} / -${removed})`);
    }
  };
  syncRemote();
  const syncTimer = setInterval(() => { host.isConnected ? syncRemote() : clearInterval(syncTimer); }, REFRESH_MS);

  // Focus recherche avec la touche "/"
  document.addEventListener("keydown", (e) => {
    if (host.isConnected && e.key === "/" && !win.classList.contains("hidden") && !current && !casinoOn) {
      const activeEl = root.activeElement || document.activeElement;
      const tag = (activeEl && activeEl.tagName) || "";
      if (tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
  });

  // === Raccourcis clavier (Alt + ...) — actifs quand le focus n'est pas dans le jeu ===
  // Alt+T nouvel onglet · Alt+W fermer l'onglet · Alt+1..9 basculer onglet/favori · Alt+H hub
  // Alt+S ajouter/retirer favori · Alt+R recharger · Alt+Z page entière · Alt+A anti-pub · Alt+M réduire/rouvrir
  document.addEventListener("keydown", (e) => {
    if (!host.isConnected || !e.altKey || e.ctrlKey || e.metaKey) return;
    const code = e.code;
    const hidden = win.classList.contains("hidden");
    let handled = true;
    if (code === "KeyM") { hidden ? bubble.click() : btnMin.click(); }
    else if (hidden) handled = false;
    else if (code === "KeyT") { createTab({ type: "hub", name: "Hub", url: "" }, true); }
    else if (code === "KeyW") { closeTab(activeTabId); }
    else if (code === "KeyH") showHub();
    else if (code === "KeyR") btnReload.click();
    else if (code === "KeyZ") { win.classList.contains("full") ? setFull(false) : btnFull.click(); }
    else if (code === "KeyA") btnShield.click();
    else if (code === "KeyS") {
      if (!current) toast("Ouvre d'abord un site");
      else {
        const found = favs.find((f) => sameSite(f.url, current));
        if (found) removeFav(found);
        else { input.value = current; addFromInput(); }
      }
    }
    else if (/^Digit[1-9]$/.test(code)) {
      const idx = Number(code.slice(5)) - 1;
      if (idx < openTabs.length) {
        switchTab(openTabs[idx].id);
      } else {
        const f = favs[idx];
        if (f) openUrl(f.url); else toast("Pas d'onglet ou favori n°" + code.slice(5));
      }
    }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // === Démarrage : le hub s'affiche, aucun site n'est ouvert ===
  render();
  updateStar();
})();
