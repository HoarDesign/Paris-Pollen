/* Paris Pollens — application */
(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------
  const CONFIG = {
    dataUrl: "data/arbres.json",
    // URL d'un relais (serveur) qui renvoie l'indice pollen Airparif / Atmo au format :
    // { "commune": "Paris", "updated": "2026-04-14T06:00:00+02:00",
    //   "days": [ { "date": "2026-04-14", "taxa": { "Bouleau": 5, "Graminées": 2, "Aulne": 1,
    //                                               "Olivier": 1, "Armoise": 1, "Ambroisie": 1 } }, … ] }
    // Laisser à null : l'app affiche des données de démonstration, signalées comme telles.
    pollenUrl: "data/pollen.json",   // écrit chaque jour par tools/fetch-pollen.py (GitHub Actions)
    nearRadius: 300,          // mètres
    center: [48.8566, 2.3522]
  };

  // Genres allergisants (potentiel RNSA) ; mois de pollinisation approximatifs (0 = janvier)
  const GENRES = {
    "BETULA":            { nom: "Bouleau",         niveau: "fort",   mois: [2, 3, 4], airparif: "Bouleau" },
    "ALNUS":             { nom: "Aulne",           niveau: "fort",   mois: [0, 1, 2], airparif: "Aulne" },
    "CARPINUS":          { nom: "Charme",          niveau: "fort",   mois: [2, 3, 4] },
    "CORYLUS":           { nom: "Noisetier",       niveau: "fort",   mois: [0, 1, 2] },
    "FRAXINUS":          { nom: "Frêne",           niveau: "fort",   mois: [1, 2, 3] },
    "CUPRESSUS":         { nom: "Cyprès",          niveau: "fort",   mois: [0, 1, 2, 3] },
    "X CUPRESSOCYPARIS": { nom: "Cyprès",          niveau: "fort",   mois: [0, 1, 2, 3] },
    "OLEA":              { nom: "Olivier",         niveau: "fort",   mois: [4, 5], airparif: "Olivier" },
    "BROUSSONETIA":      { nom: "Mûrier à papier", niveau: "fort",   mois: [3, 4] },
    "PLATANUS":          { nom: "Platane",         niveau: "modéré", mois: [2, 3, 4] },
    "QUERCUS":           { nom: "Chêne",           niveau: "modéré", mois: [3, 4] },
    "TILIA":             { nom: "Tilleul",         niveau: "modéré", mois: [5, 6] },
    "ACER":              { nom: "Érable",          niveau: "modéré", mois: [2, 3, 4] },
    "FAGUS":             { nom: "Hêtre",           niveau: "modéré", mois: [3, 4] },
    "SALIX":             { nom: "Saule",           niveau: "modéré", mois: [2, 3] },
    "LIGUSTRUM":         { nom: "Troène",          niveau: "modéré", mois: [5, 6] }
  };
  const LATIN = { "Bouleau": "Betula", "Aulne": "Alnus", "Charme": "Carpinus", "Noisetier": "Corylus", "Frêne": "Fraxinus",
    "Cyprès": "Cupressus", "Olivier": "Olea", "Mûrier à papier": "Broussonetia", "Platane": "Platanus", "Chêne": "Quercus",
    "Tilleul": "Tilia", "Érable": "Acer", "Hêtre": "Fagus", "Saule": "Salix", "Troène": "Ligustrum" };

  const AIRPARIF_TAXA = ["Bouleau", "Aulne", "Olivier", "Graminées", "Armoise", "Ambroisie"];
  const HERBACEES = ["Graminées", "Ambroisie", "Armoise"];
  const LEVELS = ["Indisponible", "Très faible", "Faible", "Modéré", "Élevé", "Très élevé", "Extrêmement élevé"];
  const MOIS_COURT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

  const ADVICE = {
    3: "Aérez tôt le matin ou tard le soir, et rincez-vous les cheveux en rentrant.",
    4: "Gardez les fenêtres fermées en journée et limitez l’effort en plein air.",
    5: "Évitez les activités en plein air et les parcs aujourd’hui. Gardez votre traitement à portée de main.",
    6: "Restez à l’intérieur autant que possible et suivez votre traitement. Consultez si les symptômes s’aggravent."
  };

  // ------------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => n.toLocaleString("fr-FR");
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ } }
  };
  function distance(lat1, lon1, lat2, lon2) {
    const k = Math.PI / 180, x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k), y = (lat2 - lat1) * k;
    return Math.sqrt(x * x + y * y) * 6371000;
  }
  const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km");
  const segs = (n) => [1, 2, 3, 4, 5, 6].map((i) => `<span class="${i <= n ? "mk" + n : "mk0"}"></span>`).join("");
  const potClass = (niv) => (niv === "fort" ? "fort" : "mod");
  const article = (nom) => (/^[aeiouhéèêâ]/i.test(nom) ? "à l’" + nom.toLowerCase() : "au " + nom.toLowerCase());

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // ------------------------------------------------------------------
  // Profil (stocké sur l'appareil)
  // ------------------------------------------------------------------
  const DEFAULT_PROFILE = { name: "", commune: "Paris", allergies: [], sensibilite: "Modérée", seuil: 4, heure: "07:30", veille: true, notif: false };
  const profile = Object.assign({}, DEFAULT_PROFILE, store.get("pp-profile", {}));
  const saveProfile = () => { store.set("pp-profile", profile); renderAvatar(); };
  const isMine = (nom) => profile.allergies.indexOf(nom) !== -1;
  const initials = () => {
    const parts = profile.name.trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("") : "";
  };
  function renderAvatar() {
    const a = $("#avatar"); const i = initials();
    a.innerHTML = i ? esc(i) : '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
  }

  // ------------------------------------------------------------------
  // Pollens (Airparif / Atmo)
  // ------------------------------------------------------------------
  let pollen = null; // { commune, demo, days: [{ date: Date, taxa: {…} }] }

  function demoPollen() {
    // Estimation à partir du calendrier pollinique : sert uniquement de démonstration.
    const peak = { "Aulne": [1, 2], "Bouleau": [3], "Olivier": [5], "Graminées": [4, 5, 6], "Armoise": [7], "Ambroisie": [7, 8] };
    const near = { "Aulne": [0, 3], "Bouleau": [2, 4], "Olivier": [4, 6], "Graminées": [3, 7], "Armoise": [6, 8], "Ambroisie": [9] };
    const days = [];
    for (let d = 0; d < 3; d++) {
      const date = new Date(); date.setDate(date.getDate() + d);
      const m = date.getMonth(), taxa = {};
      AIRPARIF_TAXA.forEach((t) => {
        let v = 1;
        if (peak[t].indexOf(m) !== -1) v = 5 - d; else if (near[t].indexOf(m) !== -1) v = 3 - (d > 1 ? 1 : 0);
        taxa[t] = Math.max(1, Math.min(6, v));
      });
      days.push({ date, taxa });
    }
    return { commune: "Paris", demo: true, days };
  }

  async function loadPollen() {
    if (CONFIG.pollenUrl) {
      try {
        const r = await fetch(CONFIG.pollenUrl, { cache: "no-store" });
        if (r.status === 404) throw new Error("absent");
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        // On garde les jours à partir d'aujourd'hui : le matin, la prévision « demain » de la veille devient « aujourd'hui ».
        const now = new Date();
        const todayKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
        const days = (j.days || []).filter((d) => d.date >= todayKey)
          .map((d) => ({ date: new Date(d.date + "T12:00:00"), taxa: d.taxa || {} }));
        if (!days.length) throw new Error("périmé");
        pollen = { commune: j.commune || "Paris", demo: false, updated: j.updated ? new Date(j.updated) : null, days };
        return;
      } catch (e) {
        if (e.message !== "absent") toast("Indice Airparif pas à jour. Affichage d’une estimation.");
      }
    }
    pollen = demoPollen();
  }

  const dayIndex = (day) => Math.max.apply(null, AIRPARIF_TAXA.map((t) => day.taxa[t] || 0));
  const dayCause = (day) => AIRPARIF_TAXA.slice().sort((a, b) => (day.taxa[b] || 0) - (day.taxa[a] || 0))[0];
  const myAirparif = () => profile.allergies.filter((a) => AIRPARIF_TAXA.indexOf(a) !== -1);
  function dayLabel(date, i) {
    if (i === 0) return "Aujourd’hui";
    if (i === 1) return "Demain";
    const j = JOURS[date.getDay()]; return j.charAt(0).toUpperCase() + j.slice(1) + " " + date.getDate();
  }

  // ------------------------------------------------------------------
  // Données arbres
  // ------------------------------------------------------------------
  let trees = [];        // { i, g, nom, niveau, libelle, espece, lat, lon, adresse }
  const counts = {};     // nom -> nombre

  async function loadTrees() {
    const r = await fetch(CONFIG.dataUrl);
    if (!r.ok) throw new Error("Données introuvables (" + r.status + ")");
    const d = await r.json();
    trees = d.trees.map((t, i) => {
      const sp = d.species[t[0]], info = GENRES[sp[0]];
      counts[info.nom] = (counts[info.nom] || 0) + 1;
      return { i, g: sp[0], nom: info.nom, niveau: info.niveau, espece: sp[1], libelle: sp[2] || info.nom,
        lat: t[1] / 1e5, lon: t[2] / 1e5, adresse: d.addresses[t[3]] };
    });
  }

  // ------------------------------------------------------------------
  // Carte
  // ------------------------------------------------------------------
  let map, cluster, heat = null, heatOn = false, renderer;
  let markers = [];
  let filter = profile.allergies.some((a) => HERBACEES.indexOf(a) === -1) ? "mine" : "all";
  let ref = null, refMarker = null, meMarker = null, meCircle = null, located = false;

  // Fond de carte épuré : OpenFreeMap (vectoriel, sans clé), sans bâtiments, aux couleurs de l'app.
  // Repli sur OpenStreetMap si WebGL ou le style ne sont pas disponibles.
  const BASEMAP = {
    style: "https://tiles.openfreemap.org/styles/positron",
    hide: /building|housenumber|aeroway|poi|transit|railway|bridge_rail|tunnel_rail|ferry|boundary/,
    colors: { background: "#F3EADB", water: "#B7D9E6", park: "#D9EAC2", road: "#FFFFFF", roadCase: "#E9DCC8", label: "#6B5D50", labelHalo: "#F7EFE3" }
  };
  function osmFallback() {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "osm-tiles", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
  }
  function tuneStyle(style) {
    const c = BASEMAP.colors;
    style.layers = style.layers.filter((l) => !BASEMAP.hide.test(l.id) && l["source-layer"] !== "building");
    style.layers.forEach((l) => {
      const id = l.id, p = l.paint = l.paint || {};
      if (l.type === "background") p["background-color"] = c.background;
      else if (l.type === "fill" && /water/.test(id)) p["fill-color"] = c.water;
      else if (l.type === "fill" && /park|wood|grass|landcover|cemetery|pitch|garden/.test(id)) { p["fill-color"] = c.park; p["fill-opacity"] = 1; }
      else if (l.type === "fill" && /landuse|residential|commercial|industrial|hospital|school/.test(id)) { p["fill-color"] = c.background; }
      else if (l.type === "line" && /waterway|river/.test(id)) p["line-color"] = c.water;
      else if (l.type === "line" && /casing/.test(id)) p["line-color"] = c.roadCase;
      else if (l.type === "line" && /highway|road|street|path|minor|major|motorway|trunk|primary|secondary|tertiary/.test(id)) p["line-color"] = c.road;
      else if (l.type === "symbol") { p["text-color"] = c.label; p["text-halo-color"] = c.labelHalo; }
    });
    return style;
  }
  async function addBasemap() {
    let webgl = false;
    try { const cv = document.createElement("canvas"); webgl = !!(cv.getContext("webgl2") || cv.getContext("webgl")); } catch (e) { /* pas de WebGL */ }
    if (!L.maplibreGL || !window.maplibregl || !webgl) { osmFallback(); return; }
    try {
      const r = await fetch(BASEMAP.style); if (!r.ok) throw new Error(r.status);
      const style = tuneStyle(await r.json());
      L.maplibreGL({
        style, interactive: false,
        attributionControl: { customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }
      }).addTo(map);
    } catch (e) { osmFallback(); }
  }

  function initMap() {
    map = L.map("map", { zoomControl: false, preferCanvas: true, maxZoom: 19, minZoom: 11 }).setView(CONFIG.center, 14);
    addBasemap();
    renderer = L.canvas({ padding: 0.5 });
    cluster = L.markerClusterGroup({
      chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 80, spiderfyOnMaxZoom: false,
      disableClusteringAtZoom: 18,
      iconCreateFunction(c) {
        const kids = c.getAllChildMarkers(); let fort = 0, mine = 0;
        kids.forEach((m) => { if (m.options.tree.niveau === "fort") fort++; if (isMine(m.options.tree.nom)) mine++; });
        const n = c.getChildCount(), size = Math.round(Math.min(46, 28 + Math.sqrt(n) * 1.3));
        const cls = "cluster" + (fort * 2 >= n ? " fort" : "") + (mine && filter !== "mine" ? " mine" : "");
        return L.divIcon({ html: `<div class="${cls}" style="width:${size}px;height:${size}px">${fmt(n)}</div>`, className: "", iconSize: [size, size] });
      }
    });
    map.addLayer(cluster);
    map.on("click", () => { closeDetail(); closeSearch(); closeFilterMenu(); });
  }

  function buildMarkers() {
    markers = trees.map((t) => {
      const col = t.niveau === "fort" ? "#F25A00" : "#F0AE00";
      const m = L.circleMarker([t.lat, t.lon], { renderer, radius: 7, weight: 2.5, color: "#FFFFFF", fillColor: col, fillOpacity: 1, tree: t });
      m.on("click", (e) => { L.DomEvent.stopPropagation(e); openDetail(t); });
      return m;
    });
  }

  function matches(t) {
    if (filter === "all") return true;
    if (filter === "fort") return t.niveau === "fort";
    if (filter === "mine") return isMine(t.nom);
    if (filter.indexOf("sp:") === 0) return t.nom === filter.slice(3);
    return true;
  }

  function applyFilter() {
    cluster.clearLayers();
    if (heat) { map.removeLayer(heat); heat = null; }
    const visible = markers.filter((m) => matches(m.options.tree));
    if (heatOn) {
      heat = L.heatLayer(visible.map((m) => [m.options.tree.lat, m.options.tree.lon, 0.5]), {
        radius: 22, blur: 16, maxZoom: 17,
        gradient: { 0.2: "#E4F6BF", 0.45: "#FFF0B8", 0.7: "#F0AE00", 0.9: "#F25A00", 1: "#E8221B" }
      }).addTo(map);
    } else {
      cluster.addLayers(visible);
    }
    renderFilterMenu();
  }

  function setFilter(f) { filter = f; applyFilter(); }

  const filterName = (f) => f === "mine" ? "Mes allergies" : f === "fort" ? "Potentiel fort" : f === "all" ? "Tous les arbres" : f.slice(3);
  function renderFilterMenu() {
    const myTrees = profile.allergies.filter((a) => HERBACEES.indexOf(a) === -1);
    const items = [
      ["mine", "Mes allergies", myTrees.length ? myTrees.join(", ") : "À indiquer dans votre profil"],
      ["all", "Tous les arbres", "Potentiel fort et modéré"],
      ["fort", "Potentiel fort", "Bouleau, frêne, charme, noisetier…"]
    ];
    if (filter.indexOf("sp:") === 0) items.push([filter, filter.slice(3), "Espèce choisie"]);
    $("#filter-menu").innerHTML = "<p>Afficher</p>" + items.map(([k, l, d]) =>
      `<button type="button" role="menuitemradio" data-filter="${esc(k)}" aria-checked="${filter === k}"><span><b>${esc(l)}</b><small>${esc(d)}</small></span><svg class="check" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></button>`).join("");
    const btn = $("#btn-filter");
    btn.classList.toggle("filtered", filter !== "all");
    btn.setAttribute("aria-label", "Filtres : " + filterName(filter));
  }
  function closeFilterMenu() { $("#filter-menu").hidden = true; $("#btn-filter").setAttribute("aria-expanded", "false"); }
  $("#btn-filter").addEventListener("click", (e) => {
    e.stopPropagation();
    const m = $("#filter-menu"), open = m.hidden;
    if (open) { renderFilterMenu(); closeSearchPanel(); }
    m.hidden = !open; $("#btn-filter").setAttribute("aria-expanded", String(open));
    if (open) { const c = m.querySelector('[aria-checked="true"]'); if (c) c.focus(); }
  });
  $("#filter-menu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filter]"); if (!b) return;
    const f = b.dataset.filter;
    closeFilterMenu();
    if (f === "mine" && !profile.allergies.some((a) => HERBACEES.indexOf(a) === -1)) {
      toast("Indiquez d’abord vos arbres allergisants dans votre profil.");
      location.hash = "#profil"; return;
    }
    setFilter(f);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeFilterMenu(); closeSearchPanel(); } });

  $("#btn-heat").addEventListener("click", function () {
    heatOn = !heatOn; this.setAttribute("aria-pressed", String(heatOn));
    this.setAttribute("aria-label", heatOn ? "Afficher les arbres" : "Afficher la densité");
    applyFilter();
  });

  $("#btn-locate").addEventListener("click", () => {
    if (!navigator.geolocation) { toast("La géolocalisation n’est pas disponible sur cet appareil."); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = L.latLng(p.coords.latitude, p.coords.longitude);
      located = true; ref = ll; clearPlace();
      if (!meMarker) {
        meCircle = L.circle(ll, { radius: p.coords.accuracy, color: "#0A84FF", weight: 1, fillColor: "#0A84FF", fillOpacity: 0.12, interactive: false }).addTo(map);
        meMarker = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18] }), interactive: false }).addTo(map);
      } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(p.coords.accuracy); }
      map.setView(ll, 17);
    }, (err) => toast("Position introuvable : " + err.message), { enableHighAccuracy: true, timeout: 10000 });
  });

  function clearPlace() { if (refMarker) { map.removeLayer(refMarker); refMarker = null; } }

  // ------------------------------------------------------------------
  // Près de vous
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Fiche arbre
  // ------------------------------------------------------------------
  function openDetail(t) {
    const info = GENRES[t.g], now = new Date().getMonth();
    const today = pollen.days[0];
    const ap = info.airparif ? (today.taxa[info.airparif] || 0) : null;
    const dist = located && ref ? " · " + fmtDist(distance(ref.lat, ref.lng, t.lat, t.lon)) : "";
    const title = t.libelle && t.libelle.toLowerCase() !== info.nom.toLowerCase() ? t.libelle : info.nom;
    const latin = (LATIN[info.nom] || t.g) + (t.espece ? " " + t.espece : "");
    const first = MOIS_LONG[info.mois[0]], last = MOIS_LONG[info.mois[info.mois.length - 1]];
    const season = MOIS_COURT.map((l, i) => {
      const on = info.mois.indexOf(i) !== -1;
      const h = on ? (i === info.mois[0] || i === info.mois[info.mois.length - 1] ? 30 : 48) : 10;
      return `<div class="${i === now ? "now" : ""}"><i class="${on ? "mk-" + potClass(info.niveau) : "mk0"}" style="height:${h}px"></i><small>${l}</small></div>`;
    }).join("");
    $("#detail").innerHTML = `
      <button type="button" class="grabber" data-close aria-label="Fermer la fiche"></button>
      <div class="detail-head">
        <div>
          <h2>${esc(title)}</h2>
          <p>${esc(latin)}<br>${esc(t.adresse)}${dist}</p>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="tiles">
        <div class="tile ${info.niveau === "fort" ? "lv4" : "lv3"}">
          <span class="k">Potentiel allergisant</span>
          <span class="v">${info.niveau === "fort" ? "Fort" : "Modéré"}</span>
          <span class="s">Classement RNSA</span>
        </div>
        ${ap !== null ? `
        <a class="tile lv${ap}" href="#alertes">
          <span class="k">Pollen aujourd’hui</span>
          <span class="v">${LEVELS[ap]}</span>
          <span class="s">Airparif${pollen.demo ? " (démo)" : ""}</span>
        </a>` : `
        <div class="tile lv0">
          <span class="k">Pollen aujourd’hui</span>
          <span class="v">Non suivi</span>
          <span class="s">Hors des 6 pollens Airparif</span>
        </div>`}
      </div>
      ${isMine(info.nom)
        ? `<div class="banner banner-mine">
             <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex:none"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
             <span>${esc(info.nom)} fait partie de vos allergies. <button type="button" data-go="#profil">Modifier</button></span>
           </div>`
        : `<div class="banner lv0"><span>Allergique ${esc(article(info.nom))} ? <button type="button" class="link-add" data-add="${esc(info.nom)}" style="border:none;background:none;padding:0;font-weight:700;color:var(--accent-text);text-decoration:underline">L’ajouter à mon profil</button></span></div>`}
      <section class="section">
        <div class="section-head" style="padding:0"><h2>Saison pollinique</h2><span>de ${first} à ${last}</span></div>
        <div class="season">${season}</div>
      </section>
      <div class="cta-wrap">
        <a class="cta" href="https://maps.apple.com/?daddr=${t.lat},${t.lon}&dirflg=w" target="_blank" rel="noopener">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8z"/></svg>
          Itinéraire</a>
      </div>`;
    const d = $("#detail"); d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    const d = $("#detail"); if (!d.classList.contains("open")) return;
    d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
  }
  $("#detail").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeDetail();
    const go = e.target.closest("[data-go]"); if (go) { closeDetail(); location.hash = go.dataset.go; }
    const add = e.target.closest("[data-add]");
    if (add) {
      profile.allergies.push(add.dataset.add); saveProfile();
      toast(add.dataset.add + " ajouté à vos allergies."); closeDetail(); renderFilterMenu();
    }
  });

  // ------------------------------------------------------------------
  // Recherche (espèces + adresses via la Base Adresse Nationale)
  // ------------------------------------------------------------------
  let searchTimer, searchSeq = 0;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function closeSearch() { $("#search-results").classList.remove("open"); }
  function openSearchPanel() {
    if ((location.hash || "#carte") !== "#carte") location.hash = "#carte";
    closeFilterMenu(); closeDetail();
    $("#search").classList.add("open"); $("#btn-search").setAttribute("aria-expanded", "true");
    setTimeout(() => $("#search-input").focus(), 50);
  }
  function closeSearchPanel() {
    closeSearch(); $("#search").classList.remove("open"); $("#btn-search").setAttribute("aria-expanded", "false");
    $("#btn-search").classList.toggle("has-query", !!$("#search-input").value);
  }
  $("#btn-search").addEventListener("click", () => {
    if ($("#search").classList.contains("open")) closeSearchPanel(); else openSearchPanel();
  });
  $("#search-input").addEventListener("input", function () {
    const q = this.value.trim();
    $("#search").classList.toggle("has-value", !!q);
    clearTimeout(searchTimer);
    if (q.length < 2) { closeSearch(); return; }
    searchTimer = setTimeout(() => runSearch(q), 250);
  });
  $("#search-clear").addEventListener("click", () => {
    $("#search-input").value = ""; $("#search").classList.remove("has-value"); closeSearch();
    $("#btn-search").classList.remove("has-query");
    if (filter.indexOf("sp:") === 0) setFilter(profile.allergies.some((a) => HERBACEES.indexOf(a) === -1) ? "mine" : "all");
    clearPlace(); if (!located) { ref = null; }
  });
  async function runSearch(q) {
    const seq = ++searchSeq, nq = norm(q);
    const sp = Object.keys(counts).filter((n) => norm(n).indexOf(nq) !== -1 || norm(LATIN[n] || "").indexOf(nq) !== -1);
    let html = sp.map((n) => `<button type="button" role="option" data-sp="${esc(n)}"><b>${esc(n)}</b><small>Afficher les ${fmt(counts[n])} arbres</small></button>`).join("");
    let addr = [];
    try {
      const r = await fetch("https://api-adresse.data.gouv.fr/search/?limit=5&lat=48.8566&lon=2.3522&q=" + encodeURIComponent(q));
      if (r.ok) addr = ((await r.json()).features || []).filter((f) => /^75/.test(f.properties.postcode || ""));
    } catch (e) { /* hors ligne */ }
    if (seq !== searchSeq) return;
    html += addr.map((f) => `<button type="button" role="option" data-ll="${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}" data-label="${esc(f.properties.label)}"><b>${esc(f.properties.name)}</b><small>${esc(f.properties.postcode + " " + f.properties.city)}</small></button>`).join("");
    $("#search-results").innerHTML = html || '<p class="near-empty" style="padding:10px 12px">Aucun résultat à Paris.</p>';
    $("#search-results").classList.add("open");
  }
  $("#search-results").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $("#search-input").blur();
    if (b.dataset.sp) { $("#search-input").value = b.dataset.sp; $("#search").classList.add("has-value"); closeSearchPanel(); setFilter("sp:" + b.dataset.sp); return; }
    const [lat, lon] = b.dataset.ll.split(",").map(Number);
    $("#search-input").value = b.dataset.label;
    clearPlace(); located = false;
    ref = L.latLng(lat, lon);
    refMarker = L.marker(ref, { icon: L.divIcon({ className: "", html: '<div class="place-pin"></div>', iconSize: [18, 18] }), interactive: false }).addTo(map);
    map.setView(ref, 17); closeSearchPanel();
  });

  // ------------------------------------------------------------------
  // Bandeau Airparif (carte) et vue Alertes
  // ------------------------------------------------------------------
  function renderAlertes() {
    const today = pollen.days[0], n = dayIndex(today), cause = dayCause(today);
    const mine = myAirparif();
    const myMax = mine.length ? Math.max.apply(null, mine.map((t) => today.taxa[t] || 0)) : 0;
    const date = today.date;
    let advice;
    if (!profile.allergies.length) advice = `<div class="advice lv0">Indiquez vos allergies dans votre <a href="#profil">profil</a> pour des conseils adaptés.</div>`;
    else if (!mine.length) advice = `<div class="advice lv0">Vos allergies ne font pas partie des 6 pollens suivis par Airparif. Consultez la carte pour les arbres autour de vous.</div>`;
    else if (myMax >= 3) advice = `<div class="advice lv${myMax}">Vos pollens sont à « ${LEVELS[myMax].toLowerCase()} » aujourd’hui. ${ADVICE[myMax]}</div>`;
    else advice = `<div class="advice lv${myMax || 1}">Vos pollens sont à un niveau ${LEVELS[myMax || 1].toLowerCase()} aujourd’hui.</div>`;

    const days = pollen.days.slice(1, 4).map((d, i) => {
      const k = dayIndex(d);
      return `<div class="day lv${k}"><span>${dayLabel(d.date, i + 1)}</span><b>${LEVELS[k]}</b></div>`;
    }).join("");
    const taxa = AIRPARIF_TAXA.slice().sort((a, b) => (today.taxa[b] || 0) - (today.taxa[a] || 0)).map((t) => {
      const v = today.taxa[t] || 0;
      return `<div class="taxon"><div class="l"><span class="n">${esc(t)}${isMine(t) ? '<span class="pill pill-mine">Votre allergie</span>' : ""}</span><span class="scale-mini">${segs(v)}</span></div><span class="v ink${v}">${LEVELS[v]}</span></div>`;
    }).join("");

    $("#alertes-body").innerHTML = `
      <div class="page-title" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
        <div><h1>Alertes pollens</h1><p>${esc(pollen.commune)} · ${JOURS[date.getDay()]} ${date.getDate()} ${MOIS_LONG[date.getMonth()]}</p></div>
        ${pollen.demo ? '<span class="pill pill-demo">Démo</span>' : ""}
      </div>
      <section class="card card-pad" style="display:flex;flex-direction:column;gap:14px" aria-label="Indice du jour">
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:14px;color:var(--muted)"><span>Indice pollen aujourd’hui</span></div>
        <div class="big-level ink${n}">${LEVELS[n]}</div>
        <div class="scale">${segs(n)}</div>
        <div class="scale-ends"><span>Très faible</span><span>Extrêmement élevé</span></div>
        ${n > 1 ? `<p style="font-size:15px;color:var(--muted)">Pollen dominant : ${esc(cause.toLowerCase())}.</p>` : ""}
        ${advice}
      </section>
      ${days ? `<section class="section" aria-label="Prévisions"><div class="section-head"><h2>Prochains jours</h2></div><div class="days">${days}</div></section>` : ""}
      <section class="section" aria-label="Par pollen">
        <div class="section-head"><h2>Par pollen</h2><span>6 suivis par Airparif</span></div>
        <div class="card list">${taxa}</div>
      </section>
      <div class="card list">
        <div class="row-setting">
          <span class="t"><b>Me prévenir</b><small>À l’ouverture de l’app, dès que vos pollens atteignent « ${LEVELS[profile.seuil].toLowerCase()} »</small></span>
          <button type="button" class="switch" role="switch" id="notif-switch" aria-checked="${profile.notif}" aria-label="Me prévenir"></button>
        </div>
      </div>
      <p class="note">${pollen.demo
        ? "Données de démonstration estimées d’après le calendrier pollinique. Une fois la source Airparif branchée, l’indice officiel par commune s’affichera ici, mis à jour chaque matin pour aujourd’hui, demain et après-demain."
        : "Source : Atmo France et Airparif, indice pollen par commune (licence ODbL)" +
          (pollen.updated ? ", mis à jour le " + pollen.updated.getDate() + " " + MOIS_LONG[pollen.updated.getMonth()] + " à " + pollen.updated.getHours() + " h " + String(pollen.updated.getMinutes()).padStart(2, "0") : "") + "."}</p>`;
  }
  $("#alertes-body").addEventListener("click", async (e) => {
    if (!e.target.closest("#notif-switch")) return;
    profile.notif = !profile.notif;
    if (profile.notif && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (err) { /* refusé */ }
    }
    saveProfile(); renderAlertes();
  });

  function maybeNotify() {
    if (!profile.notif) return;
    const today = pollen.days[0], mine = myAirparif(); if (!mine.length) return;
    const top = mine.slice().sort((a, b) => (today.taxa[b] || 0) - (today.taxa[a] || 0))[0], v = today.taxa[top] || 0;
    if (v < profile.seuil) return;
    const key = new Date().toDateString(); if (store.get("pp-notified", "") === key) return;
    store.set("pp-notified", key);
    const msg = `${top} : ${LEVELS[v].toLowerCase()} aujourd’hui. ${ADVICE[v] || ""}`;
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Paris Pollens", { body: msg }); return; } catch (e) { /* iOS hors PWA */ }
    }
    toast(msg);
  }

  // ------------------------------------------------------------------
  // Vue Espèces
  // ------------------------------------------------------------------
  let spFilter = "Tous";
  function renderEspeces() {
    const names = {};
    Object.keys(GENRES).forEach((g) => { const i = GENRES[g]; names[i.nom] = i; });
    const row = (nom) => {
      const i = names[nom];
      const months = MOIS_COURT.map((_, m) => `<span class="${i.mois.indexOf(m) !== -1 ? "mk-" + potClass(i.niveau) : "mk0"}"></span>`).join("");
      return `<button type="button" class="species-row" data-sp="${esc(nom)}">
        <span class="top"><span class="nm"><b>${esc(nom)}</b><small>${esc(LATIN[nom])}</small>${isMine(nom) ? '<span class="pill pill-mine">Vous</span>' : ""}</span><span class="c">${fmt(counts[nom] || 0)}</span></span>
        <span class="months">${months}</span></button>`;
    };
    const group = (niv, title) => {
      const list = Object.keys(names).filter((n) => names[n].niveau === niv && counts[n]).sort((a, b) => counts[b] - counts[a]);
      const total = list.reduce((a, n) => a + counts[n], 0);
      return `<section class="section"><div class="section-head"><h2>${title}</h2><span>${fmt(total)} arbres</span></div><div class="card list">${list.map(row).join("")}</div></section>`;
    };
    const grand = trees.length;
    $("#especes-body").innerHTML = `
      <div class="page-title"><h1>Espèces</h1><p>${fmt(grand)} arbres allergisants recensés à Paris</p></div>
      <div class="segmented" role="group" aria-label="Filtrer par potentiel">
        ${["Tous", "Fort", "Modéré"].map((l) => `<button type="button" data-seg="${l}" aria-pressed="${spFilter === l}">${l}</button>`).join("")}
      </div>
      ${spFilter !== "Modéré" ? group("fort", "Potentiel fort") : ""}
      ${spFilter !== "Fort" ? group("modéré", "Potentiel modéré") : ""}
      <p class="note">Potentiel allergisant : RNSA. Effectifs : inventaire « Les arbres », Paris Open Data. La frise montre la pollinisation de janvier à décembre. Touchez une espèce pour l’afficher sur la carte.</p>`;
  }
  $("#especes-body").addEventListener("click", (e) => {
    const s = e.target.closest("[data-seg]"); if (s) { spFilter = s.dataset.seg; renderEspeces(); return; }
    const r = e.target.closest("[data-sp]"); if (r) { location.hash = "#carte"; setFilter("sp:" + r.dataset.sp); }
  });

  // ------------------------------------------------------------------
  // Vue Profil
  // ------------------------------------------------------------------
  const ARBRES_PROFIL = ["Bouleau", "Aulne", "Noisetier", "Frêne", "Charme", "Cyprès", "Olivier", "Platane", "Chêne", "Tilleul", "Érable", "Hêtre", "Saule", "Troène", "Mûrier à papier"];
  function renderProfil() {
    const chips = (list) => list.map((n) => `<button type="button" class="a-chip" data-allergy="${esc(n)}" aria-pressed="${isMine(n)}">${esc(n)}</button>`).join("");
    $("#profil-body").innerHTML = `
      <div class="page-title"><h1>Profil</h1><p>Enregistré sur cet appareil</p></div>
      <div class="card card-pad account">
        <span class="avatar" aria-hidden="true">${esc(initials()) || "?"}</span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <label class="sr-only" for="p-name">Votre prénom et nom</label>
          <input id="p-name" type="text" value="${esc(profile.name)}" placeholder="Votre prénom" autocomplete="name">
          <small>Commune suivie : ${esc(profile.commune)}</small>
        </span>
      </div>
      <section class="section" aria-label="Mes allergies">
        <div class="section-head"><h2>Mes allergies</h2><span>${profile.allergies.length} sélectionnée${profile.allergies.length > 1 ? "s" : ""}</span></div>
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:14px">
          <div class="allergy-group"><span>Arbres</span><div class="allergy-chips">${chips(ARBRES_PROFIL)}</div></div>
          <div class="allergy-group"><span>Herbacées</span><div class="allergy-chips">${chips(HERBACEES)}</div></div>
          <p style="font-size:13px;line-height:1.45;color:var(--muted-2)">La carte, les alertes et les fiches mettent en avant ces pollens.</p>
        </div>
      </section>
      <section class="section" aria-label="Ma sensibilité">
        <div class="section-head"><h2>Ma sensibilité</h2></div>
        <div class="segmented" role="group" aria-label="Sensibilité">
          ${["Légère", "Modérée", "Forte"].map((l) => `<button type="button" data-sens="${l}" aria-pressed="${profile.sensibilite === l}">${l}</button>`).join("")}
        </div>
      </section>
      <section class="section" aria-label="Alertes Airparif">
        <div class="section-head"><h2>Alertes Airparif</h2></div>
        <div class="card list">
          <div class="row-setting"><label for="p-seuil" class="t"><b>M’alerter à partir de</b></label>
            <select id="p-seuil" class="select">${[3, 4, 5, 6].map((v) => `<option value="${v}" ${profile.seuil === v ? "selected" : ""}>${LEVELS[v]}</option>`).join("")}</select></div>
          <div class="row-setting"><span class="t"><b>Me prévenir</b><small>À l’ouverture de l’app</small></span>
            <button type="button" class="switch" role="switch" data-switch="notif" aria-checked="${profile.notif}" aria-label="Me prévenir"></button></div>
        </div>
      </section>
      <button type="button" class="btn-plain" id="p-reset">Effacer mon profil</button>`;
  }
  $("#profil-body").addEventListener("click", async (e) => {
    const a = e.target.closest("[data-allergy]");
    if (a) {
      const n = a.dataset.allergy;
      profile.allergies = isMine(n) ? profile.allergies.filter((x) => x !== n) : profile.allergies.concat([n]);
      saveProfile(); renderProfil(); return;
    }
    const s = e.target.closest("[data-sens]"); if (s) { profile.sensibilite = s.dataset.sens; saveProfile(); renderProfil(); return; }
    const sw = e.target.closest("[data-switch]");
    if (sw) {
      profile.notif = !profile.notif;
      if (profile.notif && "Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (err) { /* refusé */ } }
      saveProfile(); renderProfil(); return;
    }
    if (e.target.closest("#p-reset")) {
      Object.assign(profile, JSON.parse(JSON.stringify(DEFAULT_PROFILE))); saveProfile(); renderProfil(); toast("Profil effacé.");
    }
  });
  $("#profil-body").addEventListener("change", (e) => {
    if (e.target.id === "p-seuil") { profile.seuil = +e.target.value; saveProfile(); }
  });
  $("#profil-body").addEventListener("input", (e) => {
    if (e.target.id === "p-name") { profile.name = e.target.value; saveProfile(); }
  });

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  let lastAllergies = "";
  function route() {
    const tab = (location.hash || "#carte").slice(1).split("?")[0];
    const name = ["carte", "alertes", "especes", "profil"].indexOf(tab) !== -1 ? tab : "carte";
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    document.querySelectorAll(".tabbar a").forEach((a) => {
      if (a.dataset.tab === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!pollen) return;
    if (name === "alertes") renderAlertes();
    if (name === "especes" && trees.length) renderEspeces();
    if (name === "profil") renderProfil();
    if (name === "carte") {
      if (map) {
        map.invalidateSize();
        const sig = profile.allergies.join("|");
        if (sig !== lastAllergies && markers.length) { lastAllergies = sig; cluster.refreshClusters(); applyFilter(); }
      }
    }
  }
  window.addEventListener("hashchange", route);

  // ------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------
  async function start() {
    renderAvatar();
    route();
    initMap();
    renderFilterMenu();
    await loadPollen();
    route();
    try {
      await loadTrees();
      buildMarkers();
      lastAllergies = profile.allergies.join("|");
      applyFilter();
      $("#loading").remove();
      if (location.hash === "#especes") renderEspeces();
    } catch (e) {
      $("#loading").textContent = "Impossible de charger les arbres. Ouvrez l’app depuis un serveur web (pas en double-cliquant le fichier).";
    }
    maybeNotify();
  }
  start();
})();
