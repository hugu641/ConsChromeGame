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
  const getDomain = (u) => u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

  // === Icône (favicon) d'un site, avec la lettre en secours ===
  const makeIcon = (fav, size) => {
    const domain = getDomain(fav.url);
    const sources = [
      `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      `https://${domain}/favicon.ico`,
    ];

    const box = document.createElement("div");
    Object.assign(box.style, {
      width: size + "px",
      height: size + "px",
      lineHeight: size + "px",
      borderRadius: "50%",
      background: "#222",
      color: "#fff",
      fontWeight: "bold",
      fontSize: Math.round(size * 0.5) + "px",
      textAlign: "center",
      overflow: "hidden",
      flexShrink: "0",
    });
    box.textContent = (fav.name[0] || "?").toUpperCase();

    let i = 0;
    const img = new Image();
    img.onload = () => {
      box.textContent = "";
      box.style.background = "#fff";
      box.style.border = "1px solid #ddd";
      box.style.boxSizing = "border-box";
      Object.assign(img.style, {
        width: "65%",
        height: "65%",
        margin: "17% auto 0",
        display: "block",
        objectFit: "contain",
      });
      box.appendChild(img);
    };
    img.onerror = () => {
      i++;
      if (i < sources.length) img.src = sources[i];
    };
    img.src = sources[0];

    return box;
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
  title.textContent = "FloatFrame – Hub";
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

  // === Barre des boutons de sites (en haut) ===
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

  // === Zone de contenu : Hub + Iframe ===
  const content = document.createElement("div");
  Object.assign(content.style, {
    flex: "1",
    position: "relative",
    minHeight: "0",
    display: "flex",
  });

  // --- Hub ---
  const hub = document.createElement("div");
  Object.assign(hub.style, {
    flex: "1",
    overflowY: "auto",
    padding: "14px",
    background: "#fafafa",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "12px",
    alignContent: "start",
  });

  // --- Iframe (avec plein écran autorisé) ---
  const iframe = document.createElement("iframe");
  iframe.allowFullscreen = true;
  iframe.setAttribute(
    "allow",
    "fullscreen; autoplay; picture-in-picture; encrypted-media; clipboard-write"
  );
  Object.assign(iframe.style, {
    flex: "1",
    border: "none",
    width: "100%",
    display: "none",
  });

  content.append(hub, iframe);

  // === Navigation Hub <-> Site ===
  const showHub = () => {
    iframe.src = "about:blank"; // coupe la vidéo / le son
    iframe.style.display = "none";
    hub.style.display = "grid";
    title.textContent = "FloatFrame – Hub";
  };

  const openUrl = (u) => {
    const full = normalizeUrl(u);
    hub.style.display = "none";
    iframe.style.display = "block";
    iframe.src = full;
    title.textContent = full.replace(/^https?:\/\//, "");
  };

  // === Affichage du hub + de la barre de sites ===
  function renderSites() {
    const favs = loadFavorites();

    // --- Barre du haut ---
    siteBar.innerHTML = "";

    const homeChip = document.createElement("div");
    homeChip.textContent = "🏠 Hub";
    Object.assign(homeChip.style, {
      background: "#0a66c2",
      color: "#fff",
      borderRadius: "14px",
      padding: "4px 10px",
      cursor: "pointer",
    });
    homeChip.onclick = showHub;
    siteBar.appendChild(homeChip);

    favs.forEach((fav, i) => {
      const chip = document.createElement("div");
      Object.assign(chip.style, {
        display: "flex",
        alignItems: "center",
        background: "#222",
        color: "#fff",
        borderRadius: "14px",
        padding: "4px 10px 4px 5px",
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
      chip.append(makeIcon(fav, 18), label, removeX);
      siteBar.appendChild(chip);
    });

    // --- Cartes du hub ---
    hub.innerHTML = "";
    if (favs.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "Aucun site pour l'instant. Colle un lien ci-dessus puis clique sur ★ Ajouter.";
      Object.assign(empty.style, {
        gridColumn: "1 / -1",
        color: "#777",
        textAlign: "center",
        padding: "30px 10px",
      });
      hub.appendChild(empty);
      return;
    }

    favs.forEach((fav) => {
      const card = document.createElement("div");
      Object.assign(card.style, {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "10px",
        padding: "14px 8px",
        textAlign: "center",
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        transition: "transform 0.1s, box-shadow 0.1s",
      });
      card.onmouseenter = () => {
        card.style.transform = "translateY(-2px)";
        card.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";
      };
      card.onmouseleave = () => {
        card.style.transform = "none";
        card.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)";
      };

      const icon = makeIcon(fav, 42);
      icon.style.margin = "0 auto 8px";

      const name = document.createElement("div");
      name.textContent = fav.name;
      Object.assign(name.style, {
        fontWeight: "bold",
        color: "#222",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });

      const domain = document.createElement("div");
      domain.textContent = getDomain(fav.url);
      Object.assign(domain.style, {
        fontSize: "11px",
        color: "#888",
        marginTop: "2px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });

      card.onclick = () => openUrl(fav.url);
      card.append(icon, name, domain);
      hub.appendChild(card);
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
    const name = prompt("Nom du site :", getDomain(full));
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

  // === Assemblage (le hub s'affiche au lancement, aucun site n'est ouvert) ===
  wrapper.append(header, siteBar, linkBar, content);
  document.body.appendChild(wrapper);
  renderSites();

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
