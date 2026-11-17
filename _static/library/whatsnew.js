// "What's new?" on the landing pages: papers published in the last data-days days (90 by default), newest first,
// at most data-max of them (10). Computed in the viewer's browser from papers.json, so the window stays current
// between rebuilds. <div id="whats-new" data-days="90" data-max="10" data-fallback="3" [data-folder="<topic>"]>;
// data-folder limits it to one topic. With no new papers it shows the latest few instead.
(function () {
  const root = document.getElementById("whats-new");
  if (!root) return;
  if (!window.plDropdowns) {
    window.plDropdowns = true;
    document.addEventListener("click", (e) => document.querySelectorAll("details.pl-dd[open]").forEach(d => {
      if (!d.contains(e.target)) d.open = false;
    }));
  }
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
        suppLinks(p),
        p.files_url && (p.has_pdf ? srv(filesLink(p), "wn-edit", "Edit files", "Replace the PDF or add supplementary files (password)")
                                  : srv(filesLink(p), "wn-pdf", "+ Add PDF", "Upload a PDF on the library server (password)")),
      ].filter(Boolean).join("")}</span></div>
    </li>`;
  }

  // no-cache: always ask the server whether the list changed (a quick 304 when it did not).
  fetch(base + "papers.json", { cache: "no-cache" }).then(r => r.json()).then(papers => {
    [...new Set(papers.flatMap(p => p.folders))].filter(f => f !== "Unfiled").sort().forEach((f, i) => color[f] = i % 8);
    const dated = papers.filter(p => (!topic || p.folders.includes(topic)) && /^\d{4}-\d{2}-\d{2}$/.test(p.pub_date || ""))
      .sort((a, b) => b.pub_date.localeCompare(a.pub_date));
    const cutoff = Date.now() - days * DAY;
    const recent = dated.filter(p => new Date(p.pub_date + "T00:00:00") >= cutoff && new Date(p.pub_date) <= Date.now() + DAY);
    const list = recent.length ? recent.slice(0, max) : dated.slice(0, fallback);
    root.innerHTML = `<div class="wn-bar"><span class="wn-pulse"></span><b>What's new?</b>
        <span class="wn-sub">${recent.length ? `${recent.length} paper${recent.length === 1 ? "" : "s"} published in the last ${days} days` +
                                               (recent.length > max ? ` · showing the latest ${max}` : "")
                                              : `Nothing published in the last ${days} days · latest papers`}</span>
        <span class="wn-status"><a class="wn-alerts" hidden target="_blank" rel="noopener"
          title="Get an email when new papers arrive">✉ Email alerts</a><span class="wn-scan" hidden></span><span
          class="wn-updated"></span></span></div>
      <ul class="wn-list">${list.map(item).join("")}</ul>`;
    // "Last updated" (when the library was last synced) and, while a scan runs, "Scanning <topic>…".
    // Both come from updated.json, which the server publishes when a scan starts and with every rebuild.
    fetch(base + "updated.json", { cache: "no-cache" }).then(r => r.json()).then(u => {
      const time = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      if (u.last_sync) {
        const d = new Date(u.last_sync * 1000), el = root.querySelector(".wn-updated");
        el.textContent = "Last updated " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
          ", " + time(d);
        el.title = d.toString();
      }
      if (u.server) {  // the signup page (on a topic page, with that topic ticked)
        const a = root.querySelector(".wn-alerts");
        a.href = `${u.server}/subscribe${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`;
        a.hidden = false;
      }
      const scan = u.scan || {}, started = new Date(scan.topic_started || scan.run_started || 0);
      const live = u.server ? `<a href="${esc(u.server)}/topics#status" target="_blank" rel="noopener"
          title="The scan's live progress (library server, password)">Live status 🔒</a>` : "";
      const el = root.querySelector(".wn-scan");
      // A scan older than 3 hours is not running any more (its end was not published).
      if (!scan.running || Date.now() - started > 3 * 3600e3) {
        el.hidden = !live;
        el.className = "wn-scan idle";
        el.innerHTML = live.replace("Live status", "Scan status");
        return;
      }
      const draw = () => {
        const min = Math.max(0, Math.round((Date.now() - started) / 60000));
        const what = scan.topic ? `“${esc(scan.topic)}”` : "topics";
        const more = (scan.queue || []).length ? ` (+${scan.queue.length} more)` : "";
        el.innerHTML = `<span class="wn-spin" aria-hidden="true">⟳</span> Scanning ${what}${more}… started ${time(started)}
          (${min < 1 ? "just now" : `${min} min ago`}) ${live}`;
      };
      el.hidden = false;
      el.className = "wn-scan running";
      draw();
      setInterval(draw, 30000);
    }).catch(() => {});
  }).catch(() => { root.textContent = ""; });
})();
