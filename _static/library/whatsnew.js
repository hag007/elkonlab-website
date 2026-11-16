// "What's new?" on the landing page: papers published in the last data-days days (30 by default), newest first.
// Computed in the viewer's browser from papers.json, so "last week" stays current between rebuilds.
// <div id="whats-new" data-days="7" data-fallback="3"> ; with no new papers it shows the latest few instead.
(function () {
  const root = document.getElementById("whats-new");
  if (!root) return;
  const base = document.currentScript.src.replace(/whatsnew\.js.*$/, "");
  const site = base.replace(/_static\/library\/$/, "");
  const days = +root.dataset.days || 30, fallback = +root.dataset.fallback || 3;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
  const DAY = 864e5;

  function ago(date) {
    const d = Math.round((Date.now() - date) / DAY);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  }

  function item(p) {
    const date = new Date(p.pub_date + "T00:00:00");
    const fresh = Date.now() - date < 2 * DAY;
    const authors = p.authors.length > 2 ? p.authors[0] + " et al." : p.authors.join(", ");
    const preprint = p.badges.some(b => b.label === "Preprint");
    const topics = p.folders.filter(f => f !== "Unfiled").map(f =>
      `<a class="pl-badge pl-k-folder" href="${site}topics/${slug(f)}/papers.html">${esc(f.split("/").pop())}</a>`).join("");
    const title = p.doi ? `<a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
    return `<li class="wn-item">
      <div class="wn-head"><span class="wn-tag${fresh ? " hot" : ""}">${fresh ? "Breaking" : preprint ? "New preprint" : "New paper"}</span>
        <span class="wn-when">${esc(p.source)} · ${ago(date)}</span></div>
      <div class="wn-title">${title}</div>
      <div class="wn-gist">${esc(p.summary)}</div>
      <div class="wn-foot"><span class="wn-authors">${esc(authors)}</span>${topics}</div>
    </li>`;
  }

  fetch(base + "papers.json").then(r => r.json()).then(papers => {
    const dated = papers.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.pub_date || ""))
      .sort((a, b) => b.pub_date.localeCompare(a.pub_date));
    const cutoff = Date.now() - days * DAY;
    const recent = dated.filter(p => new Date(p.pub_date + "T00:00:00") >= cutoff && new Date(p.pub_date) <= Date.now() + DAY);
    const list = recent.length ? recent : dated.slice(0, fallback);
    root.innerHTML = `<div class="wn-bar"><span class="wn-pulse"></span><b>What's new?</b>
        <span class="wn-sub">${recent.length ? `${recent.length} paper${recent.length === 1 ? "" : "s"} published in the last ${days} days`
                                              : `Nothing published in the last ${days} days · latest papers`}</span></div>
      <ul class="wn-list">${list.map(item).join("")}</ul>`;
  }).catch(() => { root.textContent = ""; });
})();
