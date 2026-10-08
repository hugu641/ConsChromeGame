(() => {
  // === SITES PAR DÉFAUT (modifie cette liste comme tu veux) ===
  const DEFAULT_SITES = [
    { name: "FrAnime", url: "https://franime.fr" },
    { name: "BrainworxEdu", url: "https://brainworxedu.github.io" },
    { name: "KartBros", url: "https://kartbros.io" },
    { name: "BikeBros", url: "https://bikebros.io" },
  ];

  const normalizeUrl = (input) => {
    let u = input.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  };

  // Nettoyer une éventuelle instance précédente
  document.getElementById("__floatFrameWrapper")?.remove();
  document.getElementById("__floatFrameBubble")?.remove();

  // === Stockage des favoris ===
  const STORAGE_KEY = "__floatFrameFavorites";
  const loadFavorites = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved : DEFAULT_SITES;
    } catch {
      return DEFAULT_SITES;
    }
  };
  const saveFavorites = (favs) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)); } catch {}
  };

  // === Conteneur principal ===
  const wrapper = document.createElement("div");
  wrapper.id = "__floatFrameWrapper";
  Object.assign(wrapper.style, {
    position: "fixed",
    top: "80px",
    left: "80px",
    width: "600px",
    height: "450px",
    background: "#fff",
    border: "1px solid #999",
    borderRadius: "8px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    zIndex: 2147483647,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    resize: "both",
    fontFamily: "sans-serif",
    fontSize: "13px",
  });

  // === Barre de titre ===
  const header = document.createElement("div");
  Object.assign(header.style, {
    background: "#222",
    color: "#fff",
    padding: "6px 8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "move",
    userSelect: "none",
    flexShrink: "0",
  });

  const title = document.createElement("span");
  title.textContent = "FloatFrame";
  Object.assign(title.style, {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginRight: "8px",
  });

  const btnGroup = document.createElement("div");
  btnGroup.style.flexShrink = "0";

  const makeHeaderBtn = (text) => {
    const b = document.createElement("button");
    b.textContent = text;
    Object.assign(b.style, {
      background: "transparent",
      color: "#fff",
      border: "none",
      fontSize: "14px",
      cursor: "pointer",
      marginLeft: "6px",
      padding: "2px 6px",
    });
    return b;
  };

  const minimizeBtn = makeHeaderBtn("—");
  const maximizeBtn = makeHeaderBtn("⛶");
  const closeBtn = makeHeaderBtn("✕");
  btnGroup.append(minimizeBtn, maximizeBtn, closeBtn);
  header.append(title, btnGroup);

  // === Barre des boutons de sites ===
  const siteBar = document.createElement("div");
  Object.assign(siteBar.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    padding: "6px",
    background: "#f4f4f4",
    borderBottom: "1px solid #ddd",
    maxHeight: "90px",
    overflowY: "auto",
    flexShrink: "0",
  });

  // === Barre de lien manuel ===
  const linkBar = document.createElement("div");
  Object.assign(linkBar.style, {
    display: "flex",
    gap: "4px",
    padding: "6px",
    background: "#ebebeb",
    borderBottom: "1px solid #ccc",
    flexShrink: "0",
  });

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Colle un lien (ex: monsite.com)";
  Object.assign(input.style, {
    flex: "1",
    padding: "4px 6px",
    border: "1px solid #999",
    borderRadius: "4px",
    fontSize: "12px",
    minWidth: "0",
  });

  const makeBarBtn = (text) => {
    const b = document.createElement("button");
    b.textContent = text;
    Object.assign(b.style, {
      padding: "4px 8px",
      border: "1px solid #999",
      borderRadius: "4px",
      background: "#fff",
      cursor: "pointer",
      fontSize: "12px",
      whiteSpace: "nowrap",
    });
    return b;
  };

  const goBtn = makeBarBtn("Ouvrir");
  const addBtn = makeBarBtn("★ Ajouter");
  const resetBtn = makeBarBtn("↺");
  resetBtn.title = "Réinitialiser les favoris";
  linkBar.append(input, goBtn, addBtn, resetBtn);

  // === Iframe (avec plein écran autorisé) ===
  const iframe = document.createElement("iframe");
  iframe.allowFullscreen = true;
  iframe.setAttribute(
    "allow",
    "fullscreen; autoplay; picture-in-picture; encrypted-media; clipboard-write"
  );
  Object.assign(iframe.style, { flex: "1", border: "none", width: "100%" });

  const openUrl = (u) => {
    const full = normalizeUrl(u);
    iframe.src = full;
    title.textContent = full.replace(/^https?:\/\//, "");
  };

  // === Affichage des boutons de sites ===
  function renderSites() {
    siteBar.innerHTML = "";
    const favs = loadFavorites();
    if (favs.length === 0) {
      const empty = document.createElement("span");
      empty.textContent = "Aucun site. Ajoute un lien ci-dessous.";
      empty.style.color = "#777";
      siteBar.appendChild(empty);
      return;
    }
    favs.forEach((fav, i) => {
      const chip = document.createElement("div");
      Object.assign(chip.style, {
        display: "flex",
        alignItems: "center",
        background: "#222",
        color: "#fff",
        borderRadius: "14px",
        padding: "4px 10px",
        cursor: "pointer",
        gap: "6px",
      });
      chip.title = fav.url;

      const label = document.createElement("span");
      label.textContent = fav.name;

      const removeX = document.createElement("span");
      removeX.textContent = "✕";
      Object.assign(removeX.style, { color: "#aaa", fontSize: "11px" });
      removeX.title = "Supprimer";
      removeX.onclick = (e) => {
        e.stopPropagation();
        saveFavorites(loadFavorites().filter((_, idx) => idx !== i));
        renderSites();
      };

      chip.onclick = () => openUrl(fav.url);
      chip.append(label, removeX);
      siteBar.appendChild(chip);
    });
  }

  // === Actions de la barre de lien ===
  goBtn.onclick = () => {
    if (input.value.trim()) openUrl(input.value);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) openUrl(input.value);
  });
  addBtn.onclick = () => {
    if (!input.value.trim()) return;
    const full = normalizeUrl(input.value);
    const defaultName = full.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const name = prompt("Nom du bouton :", defaultName);
    if (!name) return;
    const favs = loadFavorites();
    favs.push({ name, url: full });
    saveFavorites(favs);
    input.value = "";
    renderSites();
  };
  resetBtn.onclick = () => {
    if (confirm("Remettre les sites par défaut ?")) {
      saveFavorites(DEFAULT_SITES);
      renderSites();
    }
  };

  // === Assemblage ===
  wrapper.append(header, siteBar, linkBar, iframe);
  document.body.appendChild(wrapper);
  renderSites();

  // Ouvre automatiquement le premier site de la liste
  const first = loadFavorites()[0];
  if (first) openUrl(first.url);

  // === Bulle (mode réduit) ===
  const bubble = document.createElement("div");
  bubble.id = "__floatFrameBubble";
  bubble.textContent = "🌐";
  Object.assign(bubble.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "50px",
    height: "50px",
    borderRadius: "50%",
    background: "#222",
    color: "#fff",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    cursor: "pointer",
    zIndex: 2147483647,
    boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
  });
  document.body.appendChild(bubble);

  minimizeBtn.onclick = () => {
    wrapper.style.display = "none";
    bubble.style.display = "flex";
  };
  bubble.onclick = () => {
    wrapper.style.display = "flex";
    bubble.style.display = "none";
  };
  closeBtn.onclick = () => {
    wrapper.remove();
    bubble.remove();
  };

  // === Agrandir / Restaurer ===
  let isMaximized = false;
  let savedRect = null;
  maximizeBtn.onclick = () => {
    if (!isMaximized) {
      savedRect = {
        top: wrapper.style.top,
        left: wrapper.style.left,
        width: wrapper.style.width,
        height: wrapper.style.height,
      };
      Object.assign(wrapper.style, {
        top: "0px",
        left: "0px",
        width: "100vw",
        height: "100vh",
        borderRadius: "0",
        resize: "none",
      });
      maximizeBtn.textContent = "❐";
      isMaximized = true;
    } else {
      Object.assign(wrapper.style, {
        ...savedRect,
        borderRadius: "8px",
        resize: "both",
      });
      maximizeBtn.textContent = "⛶";
      isMaximized = false;
    }
  };

  // === Déplacement ===
  let dragging = false, offsetX = 0, offsetY = 0;
  header.addEventListener("mousedown", (e) => {
    if (isMaximized) return;
    dragging = true;
    offsetX = e.clientX - wrapper.offsetLeft;
    offsetY = e.clientY - wrapper.offsetTop;
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    wrapper.style.left = `${e.clientX - offsetX}px`;
    wrapper.style.top = `${e.clientY - offsetY}px`;
  });
  document.addEventListener("mouseup", () => (dragging = false));
})();
