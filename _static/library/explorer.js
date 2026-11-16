// Paper Library explorer: search + folder/badge filters, all in the browser.
// Data: papers.json next to this script. URL ?folder=<name> preselects a topic;
// <div id="paper-explorer" data-folder="<name>"> locks the explorer to one topic (topic pages).
(function () {
  const root = document.getElementById("paper-explorer");
  if (!root) return;
  const base = document.currentScript.src.replace(/explorer\.js.*$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const locked = root.dataset.folder || "";
  const state = { q: "", folder: locked || new URLSearchParams(location.search).get("folder") || "", badges: new Set(), sort: "" };
  let papers = [];

  // Field weights for ranking, like the server app's full-text search.
  const FIELDS = [["title", 10], ["authorsText", 3], ["summary", 4], ["abstract", 2], ["badgeText", 5], ["source", 1]];
  const words = (s) => (s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []);

  function prepare(p) {
    p.authorsText = p.authors.join(" ");
    p.badgeText = p.badges.map(b => b.label).join(" ");
    p.tokens = {};
    for (const [f] of FIELDS) p.tokens[f] = words(p[f] || "");
    return p;
  }

  function score(p, terms) {
    let total = 0;
    for (const t of terms) {
      let best = 0;
      for (const [f, w] of FIELDS) {
        const hits = p.tokens[f].filter(x => x.startsWith(t)).length;
        if (hits) best += w * (1 + Math.log(hits));
      }
      if (!best) return 0;  // every word must match somewhere
      total += best;
    }
    return total;
  }

  function snippet(text, terms) {
    if (!text || !terms.length) return "";
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) { const i = lower.search(new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return "";
    const start = Math.max(0, at - 90), piece = text.slice(start, at + 180);
    let out = esc(piece);
    for (const t of terms) out = out.replace(new RegExp("\\b(" + esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\p{L}\\p{N}-]*)", "giu"), "<mark>$1</mark>");
    return (start ? "… " : "") + out + " …";
  }

  const badge = (b, extra = "") =>
    `<span class="pl-badge pl-k-${esc(b.kind)}${state.badges.has(b.label) ? " on" : ""}" data-badge="${esc(b.label)}">${esc(b.label)}${extra}</span>`;
  const folderBadge = (f, extra = "") =>
    `<span class="pl-badge pl-k-folder${state.folder === f ? " on" : ""}" data-folder="${esc(f)}">${esc(f)}${extra}</span>`;

  function card(p, terms) {
    const meta = [p.authors.length > 3 ? p.authors.slice(0, 3).join(", ") + " et al." : p.authors.join(", "),
                  p.source, p.pub_date || p.year, p.impact != null ? `IF ≈ ${p.impact}` : ""].filter(Boolean).join(" · ");
    const hl = p.badges.filter(b => b.kind === "highlight"), rest = p.badges.filter(b => b.kind !== "highlight");
    const links = [p.doi && `<a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener">DOI</a>`,
                   p.pmid && `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener">PubMed</a>`,
                   p.arxiv && `<a href="https://arxiv.org/abs/${esc(p.arxiv)}" target="_blank" rel="noopener">arXiv</a>`].filter(Boolean).join("");
    const snip = snippet(p.abstract, terms);
    return `<div class="pl-card">
      <h3>${p.doi ? `<a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</h3>
      <div class="pl-meta">${esc(meta)}</div>
      <div>${hl.map(b => badge(b)).join("")}${locked ? "" : p.folders.map(f => folderBadge(f)).join("")}${rest.map(b => badge(b)).join("")}</div>
      <p>${esc(p.summary)}</p>
      ${snip ? `<p class="pl-snip">${snip}</p>` : ""}
      ${p.abstract ? `<details><summary>Abstract</summary><p>${esc(p.abstract)}</p></details>` : ""}
      <div class="pl-links">${links}</div>
    </div>`;
  }

  function render() {
    const terms = words(state.q);
    let list = papers.filter(p => (!state.folder || p.folders.includes(state.folder)) &&
      [...state.badges].every(l => p.badges.some(b => b.label === l)));
    if (terms.length) list = list.map(p => [score(p, terms), p]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    if (state.sort === "date" || (!terms.length && !state.sort)) list.sort((a, b) => String(b.pub_date || b.year).localeCompare(String(a.pub_date || a.year)));
    if (state.sort === "impact") list.sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
    if (state.sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));

    const folders = {}, badges = {};
    for (const p of papers) {
      if (locked && !p.folders.includes(locked)) continue;  // facet counts for this topic only
      p.folders.forEach(f => folders[f] = (folders[f] || 0) + 1);
      p.badges.forEach(b => { badges[b.label] = badges[b.label] || { ...b, n: 0 }; badges[b.label].n++; });
    }
    const order = ["highlight", "type", "topic", "data", "disease", "status"];
    const badgeList = Object.values(badges).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.n - a.n);
    root.querySelector(".pl-folders").innerHTML = locked ? "" : "<b>Topics</b>" +
      Object.entries(folders).map(([f, n]) => folderBadge(f, ` ${n}`)).join("");
    root.querySelector(".pl-badgefacets").innerHTML = "<b>Badges</b>" + badgeList.map(b => badge(b, ` ${b.n}`)).join("");
    const filters = [locked ? "" : state.folder, ...state.badges].filter(Boolean);
    root.querySelector(".pl-count").textContent = `${list.length} paper${list.length === 1 ? "" : "s"}` +
      (state.q ? ` matching “${state.q}”` : "") + (filters.length ? ` · filtered by ${filters.join(", ")}` : "");
    root.querySelector(".pl-list").innerHTML = list.map(p => card(p, terms)).join("") || "<p>No papers found.</p>";
  }

  root.innerHTML = `<div class="pl-bar">
      <input type="search" placeholder="${locked ? "Search papers in this topic…" : "Search titles, authors, summaries, abstracts…"}" aria-label="Search papers">
      <select aria-label="Sort"><option value="">Relevance / newest</option><option value="date">Newest first</option>
        <option value="impact">Impact factor</option><option value="title">Title</option></select>
    </div>
    <div class="pl-facets pl-folders"></div><div class="pl-facets pl-badgefacets"></div>
    <div class="pl-count"></div><div class="pl-list"></div>`;

  let timer;
  root.querySelector("input").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 150); });
  root.querySelector("select").addEventListener("change", e => { state.sort = e.target.value; render(); });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-badge]"), f = e.target.closest("[data-folder]");
    if (b) { const l = b.dataset.badge; state.badges.has(l) ? state.badges.delete(l) : state.badges.add(l); render(); }
    else if (f && !locked) { state.folder = state.folder === f.dataset.folder ? "" : f.dataset.folder; render(); }
  });

  fetch(base + "papers.json").then(r => r.json()).then(data => { papers = data.map(prepare); render(); })
    .catch(() => { root.querySelector(".pl-list").textContent = "Could not load the paper list."; });
})();
