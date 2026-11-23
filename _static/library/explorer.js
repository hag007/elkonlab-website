// Paper Library explorer: search + folder/badge filters, all in the browser.
// Data: papers.json next to this script. URL ?folder=<name> preselects a topic;
// <div id="paper-explorer" data-folder="<name>"> locks the explorer to one topic (topic pages).
(function () {
  const root = document.getElementById("paper-explorer");
  if (!root) return;
  if (!window.plDropdowns) {
    window.plDropdowns = true;
    document.addEventListener("click", (e) => document.querySelectorAll("details.pl-dd[open]").forEach(d => {
      if (!d.contains(e.target)) d.open = false;
    }));
  }
  const base = document.currentScript.src.replace(/explorer\.js.*$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const locked = root.dataset.folder || "";
  const state = { q: "", folder: locked || new URLSearchParams(location.search).get("folder") || "", badges: new Set(new URLSearchParams(location.search).getAll("badge")), sort: "",
                  author: "", journal: "", yFrom: "", yTo: "", minIf: "" };
  const yearOf = (p) => +String(p.pub_date || p.year || "").slice(0, 4) || 0;
  const lastName = (a) => (a || "").trim().split(/\s+/).pop().toLowerCase();
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let papers = [];
  const uid = Math.random().toString(36).slice(2, 8);  // unique datalist id

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

  // The paper in its topic's paper manager (on a topic's page that topic, otherwise its first), scrolled to and highlighted.
  const manageLink = (p, topic, cls) => {
    const m = p.manage || {}, url = m[topic] || Object.values(m)[0];
    return url ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener"
      title="This paper in the topic's paper manager: move, remove, lab members (library server, password)">Manage 🔒</a>` : "";
  };

  function card(p, terms) {
    const meta = [p.authors.length > 3 ? p.authors.slice(0, 3).join(", ") + " et al." : p.authors.join(", "),
                  p.source, p.pub_date || p.year, p.impact != null ? `IF ≈ ${p.impact}` : ""].filter(Boolean).join(" · ");
    const top = (b) => b.kind === "highlight" || b.kind === "member";
    const hl = p.badges.filter(top), rest = p.badges.filter(b => !top(b));
    // PDFs and supplementary files live on the password-protected library server.
    const filesLink = (p) => `${p.files_url}?back=${encodeURIComponent(location.href)}`;  // the files page links back here
    const srv = (href, cls, text, title) => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title)}">${text}</a>`;
    // Supplementary files: one "Show all files" button that opens a list of the files.
    const suppLinks = (p) => {
      const s = p.supp || [];
      if (!s.length) return "";
      const size = (n) => n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
      return `<details class="pl-dd"><summary title="Supplementary files (library server, password)">📎 Show all files (${s.length})</summary>
        <div class="pl-dd-menu">${s.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">
          <span class="pl-dd-name">${esc(f.name)}</span><span class="pl-dd-size">${size(f.size)}</span></a>`).join("")}
          <a class="pl-dd-all" href="${esc(p.supp_zip)}" rel="noopener"><span>⬇ Download all (.zip)</span>
          <span class="pl-dd-size">${size(s.reduce((t, f) => t + (f.size || 0), 0))}</span></a></div></details>`;
    };
    // Footer like the landing page's cards: outside links on the left, the paper's files on the right.
    const files = [p.pdf_url && srv(p.pdf_url, "pl-pdf", "PDF 🔒", "Opens on the library server (password)"),
                   suppLinks(p),
                   manageLink(p, locked, "pl-edit"),
                   p.files_url && (p.has_pdf ? srv(filesLink(p), "pl-edit", "Edit files", "Replace the PDF or add supplementary files (password)")
                                             : srv(filesLink(p), "pl-pdf", "+ Add PDF", "Upload a PDF on the library server (password)"))
                  ].filter(Boolean).join("");
    const links = [p.doi &&`<a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener">DOI</a>`,
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
      <div class="pl-links"><span class="pl-ext">${links}</span><span class="pl-files">${files}</span></div>
    </div>`;
  }

  function render() {
    const terms = words(state.q);
    const author = norm(state.author.trim());
    let list = papers.filter(p => (!state.folder || p.folders.includes(state.folder)) &&
      [...state.badges].every(l => p.badges.some(b => b.label === l)) &&
      (!author || p.authors.some(a => norm(a).includes(author))) &&
      (!state.journal || p.source === state.journal) &&
      (!state.yFrom || yearOf(p) >= +state.yFrom) && (!state.yTo || yearOf(p) <= +state.yTo) &&
      (!state.minIf || (p.impact ?? -1) >= +state.minIf));
    if (terms.length) list = list.map(p => [score(p, terms), p]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const date = (p) => String(p.pub_date || p.year || "");
    if (state.sort === "date" || (!terms.length && !state.sort)) list.sort((a, b) => date(b).localeCompare(date(a)));
    if (state.sort === "oldest") list.sort((a, b) => date(a).localeCompare(date(b)));
    if (state.sort === "impact") list.sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
    if (state.sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (state.sort === "author") list.sort((a, b) => lastName(a.authors[0]).localeCompare(lastName(b.authors[0])) || date(b).localeCompare(date(a)));
    if (state.sort === "journal") list.sort((a, b) => (a.source || "").localeCompare(b.source || "") || date(b).localeCompare(date(a)));

    const folders = {}, badges = {};
    for (const p of papers) {
      if (locked && !p.folders.includes(locked)) continue;  // facet counts for this topic only
      p.folders.forEach(f => folders[f] = (folders[f] || 0) + 1);
      p.badges.forEach(b => { badges[b.label] = badges[b.label] || { ...b, n: 0 }; badges[b.label].n++; });
    }
    const order = ["highlight", "member", "type", "topic", "data", "disease", "status"];
    const badgeList = Object.values(badges).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.n - a.n);
    root.querySelector(".pl-folders").innerHTML = locked ? "" : "<b>Topics</b>" +
      Object.entries(folders).map(([f, n]) => folderBadge(f, ` ${n}`)).join("");
    root.querySelector(".pl-badgefacets").innerHTML = "<b>Badges</b>" + badgeList.map(b => badge(b, ` ${b.n}`)).join("");
    const years = state.yFrom || state.yTo ? (state.yFrom === state.yTo ? state.yFrom : `${state.yFrom || "…"}–${state.yTo || "…"}`) : "";
    const filters = [locked ? "" : state.folder, ...state.badges, state.author && `author “${state.author.trim()}”`,
                     state.journal, years, state.minIf && `IF ≥ ${state.minIf}`].filter(Boolean);
    root.querySelector(".pl-count").textContent = `${list.length} paper${list.length === 1 ? "" : "s"}` +
      (state.q ? ` matching “${state.q}”` : "") + (filters.length ? ` · filtered by ${filters.join(", ")}` : "");
    root.querySelector(".pl-clear").hidden = !(state.q || filters.length);
    root.querySelector(".pl-list").innerHTML = list.map(p => card(p, terms)).join("") || "<p>No papers found.</p>";
  }

  root.innerHTML = `<div class="pl-bar">
      <input type="search" placeholder="${locked ? "Search papers in this topic…" : "Search titles, authors, summaries, abstracts…"}" aria-label="Search papers">
      <label class="pl-sort">Sort <select data-key="sort" aria-label="Sort">
        <option value="">Relevance / newest</option><option value="date">Newest first</option><option value="oldest">Oldest first</option>
        <option value="impact">Impact factor (high → low)</option><option value="title">Title (A → Z)</option>
        <option value="author">First author (A → Z)</option><option value="journal">Journal (A → Z)</option></select></label>
    </div>
    <div class="pl-filters">
      <label>Author <input type="search" data-key="author" list="pl-authors-${uid}" placeholder="any author" aria-label="Filter by author"></label>
      <datalist id="pl-authors-${uid}"></datalist>
      <label>Journal <select data-key="journal" aria-label="Filter by journal"><option value="">All</option></select></label>
      <label>Year <select data-key="yFrom" aria-label="From year"><option value="">from</option></select>
        – <select data-key="yTo" aria-label="To year"><option value="">to</option></select></label>
      <label>Impact factor <select data-key="minIf" aria-label="Minimum impact factor"><option value="">any</option>
        ${[3, 5, 7, 10, 20, 40].map(v => `<option value="${v}">≥ ${v}</option>`).join("")}</select></label>
      <button type="button" class="pl-clear" hidden>Clear all</button>
    </div>
    <div class="pl-facets pl-folders"></div><div class="pl-facets pl-badgefacets"></div>
    <div class="pl-count"></div><div class="pl-list"></div>`;

  // Fill the author, journal and year choices from this list's papers (one topic on topic pages).
  function fillChoices() {
    const scope = locked ? papers.filter(p => p.folders.includes(locked)) : papers;
    const opts = (vals) => vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    const journals = [...new Set(scope.map(p => p.source).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const years = [...new Set(scope.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
    const authors = [...new Set(scope.flatMap(p => p.authors))].sort((a, b) => lastName(a).localeCompare(lastName(b)));
    root.querySelector('[data-key="journal"]').insertAdjacentHTML("beforeend", opts(journals));
    root.querySelector('[data-key="yFrom"]').insertAdjacentHTML("beforeend", opts(years));
    root.querySelector('[data-key="yTo"]').insertAdjacentHTML("beforeend", opts(years));
    root.querySelector("datalist").innerHTML = opts(authors);
  }

  let timer;
  const searchBox = root.querySelector(".pl-bar input");
  searchBox.addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 150); });
  root.querySelectorAll("[data-key]").forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => { state[el.dataset.key] = e.target.value; render(); }, el.tagName === "SELECT" ? 0 : 150);
  }));
  root.querySelector(".pl-clear").addEventListener("click", () => {
    Object.assign(state, { q: "", author: "", journal: "", yFrom: "", yTo: "", minIf: "", folder: locked || "" });
    state.badges.clear();
    searchBox.value = "";
    root.querySelectorAll(".pl-filters [data-key]").forEach(el => el.value = "");
    render();
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-badge]"), f = e.target.closest("[data-folder]");
    if (b) { const l = b.dataset.badge; state.badges.has(l) ? state.badges.delete(l) : state.badges.add(l); render(); }
    else if (f && !locked) { state.folder = state.folder === f.dataset.folder ? "" : f.dataset.folder; render(); }
  });

  // no-cache: always ask the server whether the list changed (a quick 304 when it did not).
  fetch(base + "papers.json", { cache: "no-cache" }).then(r => r.json()).then(data => { papers = data.map(prepare); fillChoices(); render(); })
    .catch(() => { root.querySelector(".pl-list").textContent = "Could not load the paper list."; });
})();
