// "What's new?" on the landing pages: papers published in the last data-days days (90 by default), newest first,
// at most data-max of them (10). Computed in the viewer's browser from papers.json, so the window stays current
// between rebuilds. <div id="whats-new" data-days="90" data-max="10" data-fallback="3" [data-folder="<topic>"]>;
// data-folder limits it to one topic. With no new papers it shows the latest few instead.
(function () {
  const root = document.getElementById("whats-new");
  if (!root) return;
  const base = document.currentScript.src.replace(/whatsnew\.js.*$/, "");
  const site = base.replace(/_static\/library\/$/, "");
  const days = +root.dataset.days || 90, max = +root.dataset.max || 10, fallback = +root.dataset.fallback || 3;
  const topic = root.dataset.folder || "";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
  const DAY = 864e5;

  function ago(date) {
    const d = Math.round((Date.now() - date) / DAY);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  }

  // One colour per topic (topics in alphabetical order over the whole library, so each keeps its colour).
  const color = {};

  // PDFs and supplementary files live on the password-protected library server.
  const filesLink = (p) => `${p.files_url}?back=${encodeURIComponent(location.href)}`;  // the files page links back here
  const srv = (href, cls, text, title) =>
    `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title)}">${text}</a>`;
  // One link per supplementary file: "Supplementary · xlsx", or "Supp. 1 · pdf", "Supp. 2 · xlsx"… (full name on hover).
  const suppLinks = (p, cls) => {
    const s = p.supp || [], ext = (n) => ((n.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || "file").toLowerCase();
    const out = s.slice(0, 4).map((f, i) => srv(f.url, cls, `📎 ${s.length === 1 ? "Supplementary" : `Supp. ${i + 1}`} · ${ext(f.name)}`,
                                                 `${f.name} (library server, password)`));
    if (s.length > 4) out.push(srv(filesLink(p), cls, `+${s.length - 4} more`, "All supplementary files (password)"));
    return out.join("");
  };

  function item(p) {
    const date = new Date(p.pub_date + "T00:00:00");
    const fresh = Date.now() - date < 2 * DAY;
    const authors = p.authors.length > 2 ? p.authors[0] + " et al." : p.authors.join(", ");
    const preprint = p.badges.some(b => b.label === "Preprint");
    const topics = p.folders.filter(f => f !== "Unfiled" && f !== topic).map(f =>
      `<a class="pl-badge wn-topic wn-c${color[f] ?? 0}" href="${site}topics/${slug(f)}/papers.html">${esc(f.split("/").pop())}</a>`).join("");
    const title = p.doi ? `<a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
    return `<li class="wn-item">
      <div class="wn-head"><span class="wn-tag${fresh ? " hot" : ""}">${fresh ? "Breaking" : preprint ? "New preprint" : "New paper"}</span>
        <span class="wn-when">${esc(p.source)} · ${ago(date)}</span></div>
      <div class="wn-title">${title}</div>
      <div class="wn-gist">${esc(p.summary)}</div>
      <div class="wn-foot"><span class="wn-authors">${esc(authors)}</span>${topics}<span class="wn-files">${[
        p.pdf_url && srv(p.pdf_url, "wn-pdf", "PDF 🔒", "Opens on the library server (password)"),
        suppLinks(p, "wn-supp"),
        p.files_url && (p.has_pdf ? srv(filesLink(p), "wn-edit", "Edit files", "Replace the PDF or add supplementary files (password)")
                                  : srv(filesLink(p), "wn-pdf", "+ Add PDF", "Upload a PDF on the library server (password)")),
      ].filter(Boolean).join("")}</span></div>
    </li>`;
  }

  fetch(base + "papers.json").then(r => r.json()).then(papers => {
    [...new Set(papers.flatMap(p => p.folders))].filter(f => f !== "Unfiled").sort().forEach((f, i) => color[f] = i % 8);
    const dated = papers.filter(p => (!topic || p.folders.includes(topic)) && /^\d{4}-\d{2}-\d{2}$/.test(p.pub_date || ""))
      .sort((a, b) => b.pub_date.localeCompare(a.pub_date));
    const cutoff = Date.now() - days * DAY;
    const recent = dated.filter(p => new Date(p.pub_date + "T00:00:00") >= cutoff && new Date(p.pub_date) <= Date.now() + DAY);
    const list = recent.length ? recent.slice(0, max) : dated.slice(0, fallback);
    root.innerHTML = `<div class="wn-bar"><span class="wn-pulse"></span><b>What's new?</b>
        <span class="wn-sub">${recent.length ? `${recent.length} paper${recent.length === 1 ? "" : "s"} published in the last ${days} days` +
                                               (recent.length > max ? ` · showing the latest ${max}` : "")
                                              : `Nothing published in the last ${days} days · latest papers`}</span></div>
      <ul class="wn-list">${list.map(item).join("")}</ul>`;
  }).catch(() => { root.textContent = ""; });
})();
