// The papers on the landing pages, as cards: newest additions first (each day's sync adds its papers at the top),
// 100 at a time with "Show more", so no card ever drops off. Each card: a figure (openly licensed papers), the lab,
// journal and date, a synopsis, and links: the paper's card on its topic's Papers page (highlighted), the podcast
// moment, the PDF and files, Manage, and 👤 lab members (a small window on the library server, password). Calm on
// purpose: no box, no "breaking" tags. Data: feed.json. <div id="whats-new" [data-folder="<topic>"]>: data-folder
// limits it to one topic.
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
  const PAGE = 100;  // cards shown at first; "Show more" adds the next 100 (a card never drops off the page)
  const topic = root.dataset.folder || "";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
  const DAY = 864e5;

  function ago(date) {  // "today", "3 days ago", or the date itself after a month
    if (isNaN(date)) return "";
    const d = Math.round((Date.now() - date) / DAY);
    if (d > 30 || d < 0) return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

  // The paper in its topic's paper manager (this page's topic, or else its first), scrolled to and highlighted.
  const manageLink = (p) => {
    const m = p.manage || {}, url = m[topic] || Object.values(m)[0];
    return url ? srv(url, "wn-edit", "Manage 🔒", "This paper in the topic's paper manager: move, remove, lab members (library server, password)") : "";
  };

  const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const LICENSES = { cc_by: "CC BY", "cc-by": "CC BY", cc_by_nc: "CC BY-NC", "cc-by-nc": "CC BY-NC", cc_by_sa: "CC BY-SA",
                     "cc-by-sa": "CC BY-SA", cc_by_nc_sa: "CC BY-NC-SA", "cc-by-nc-sa": "CC BY-NC-SA", cc0: "CC0" };
  // Its card on the topic's Papers page (this page's topic, or else its first), highlighted for 3 seconds there.
  const cardLink = (p) => `${site}topics/${slug(topic && p.topics.includes(topic) ? topic : p.topics[0] || "")}/papers.html#paper-${encodeURIComponent(p.id)}`;
  const memberBadges = (names) => names.map(n => `<span class="pl-badge pl-k-member">${esc(n)}</span>`).join("");

  function item(p) {
    const preprint = p.badges.some(b => b.label === "Preprint");
    const highlights = p.badges.filter(b => b.kind === "highlight").map(b => `<span class="pl-badge pl-k-highlight">${esc(b.label)}</span>`).join("");
    const topics = p.topics.filter(f => f !== topic).map(f =>
      `<a class="pl-badge wn-topic wn-c${color[f] ?? 0}" href="${site}topics/${slug(f)}/papers.html">${esc(f.split("/").pop())}</a>`).join("");
    const fig = p.figure ? `<a class="wn-fig" href="${esc(site + p.figure)}" target="_blank" rel="noopener" title="Open the figure">
        <img src="${esc(site + p.figure)}" alt="A figure from “${esc(p.title)}”" loading="lazy"></a>
        <div class="wn-credit">Figure from the paper${LICENSES[p.license] ? ` (${LICENSES[p.license]})` : ""}</div>` : "";
    const listen = p.episode ? `<a class="wn-listen" href="${site}podcast.html?d=${esc(p.episode.d)}&t=${esc(p.episode.t)}${
      p.episode.at != null ? `&at=${p.episode.at}" title="Plays from where this paper is discussed">🎧 Listen (${clock(p.episode.at)})`
                           : `">🎧 Listen`}</a>` : "";
    return `<li class="wn-item wn-card${p.figure ? "" : " nofig"}" data-id="${esc(p.id)}">
      ${fig}
      <div class="wn-body">
        <div class="wn-head"><span class="wn-when">${esc([p.source, /^\d{4}-\d{2}-\d{2}/.test(p.date || "") ? ago(new Date(p.date + "T00:00:00")) : p.date].filter(Boolean).join(" · "))}</span>${
          preprint ? '<span class="pl-badge pl-k-status">Preprint</span>' : ""}</div>
        <div class="wn-title"><a href="${esc(cardLink(p))}" title="This paper on its topic's Papers page">${esc(p.title)}</a></div>
        <div class="wn-lab">${esc((p.lab || "").replace(/^the /, "The "))}${highlights}<span class="wn-members" data-id="${esc(p.id)}">${memberBadges(p.members || [])}</span></div>
        <div class="wn-gist">${esc(p.synopsis)}</div>
        <div class="wn-foot">${topics}<span class="wn-files">${[
          listen,
          p.pdf_url && srv(p.pdf_url, "wn-pdf", "PDF 🔒", "Opens on the library server (password)"),
          suppLinks(p),
          p.files_url && (p.has_pdf ? srv(filesLink(p), "wn-edit", "Edit files", "Replace the PDF or add supplementary files (password)")
                                    : srv(filesLink(p), "wn-pdf", "+ Add PDF", "Upload a PDF on the library server (password)")),
          manageLink(p),
          p.assign_url && `<button type="button" class="wn-assign" data-url="${esc(p.assign_url)}" title="Lab members: add or remove (library server, password)">👤 Lab members</button>`,
        ].filter(Boolean).join("")}</span></div>
      </div>
    </li>`;
  }

  // 👤: lab members in a small window on the library server (it asks for the password); when saved there, it tells
  // this page, and the card's badges change at once (the website itself follows after the sync).
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".wn-assign");
    if (!b) return;
    const w = window.open(b.dataset.url, "pl-members", "popup,width=460,height=560");
    if (!w) location.href = b.dataset.url;  // popups blocked: open it here
  });
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type !== "pl-members" || !root.querySelector(`.wn-assign[data-url^="${e.origin}/"]`)) return;  // (from the library server only)
    root.querySelectorAll(`.wn-members[data-id="${CSS.escape(d.id)}"]`).forEach(el => { el.innerHTML = memberBadges(d.members || []); });
  });

  // no-cache: always ask the server whether the list changed (a quick 304 when it did not).
  fetch(base + "feed.json", { cache: "no-cache" }).then(r => r.json()).then(papers => {
    [...new Set(papers.flatMap(p => p.topics))].sort().forEach((f, i) => color[f] = i % 8);
    // Newest additions first (each day's sync adds its papers at the top), then by publication date.
    const all = papers.filter(p => !topic || p.topics.includes(topic))
      .sort((a, b) => (b.added || "").localeCompare(a.added || "") || (b.date || "").localeCompare(a.date || ""));
    let shown = Math.min(PAGE, all.length);
    root.innerHTML = `<div class="wn-bar"><span class="wn-sub">Papers, newest first · ${all.length} in all</span>
        <span class="wn-status"><a class="wn-alerts" hidden target="_blank" rel="noopener"
          title="Get an email when new papers arrive">✉ Email alerts</a><span class="wn-scan" hidden></span><span
          class="wn-updated"></span></span></div>
      <ul class="wn-list">${all.slice(0, shown).map(item).join("")}</ul>
      <div class="wn-more">${shown < all.length ? `<button type="button" class="wn-assign">Show more</button>` : ""}</div>`;
    root.querySelector(".wn-more").addEventListener("click", (e) => {
      if (!e.target.closest("button")) return;
      root.querySelector(".wn-list").insertAdjacentHTML("beforeend", all.slice(shown, shown + PAGE).map(item).join(""));
      shown = Math.min(shown + PAGE, all.length);
      if (shown >= all.length) root.querySelector(".wn-more").innerHTML = "";
    });
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
        el.innerHTML = `Scanning ${what}${more}, started ${time(started)}
          (${min < 1 ? "just now" : `${min} min ago`}) ${live}`;
      };
      el.hidden = false;
      el.className = "wn-scan running";
      draw();
      setInterval(draw, 30000);
    }).catch(() => {});
  }).catch(() => { root.textContent = ""; });
})();
