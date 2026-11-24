// The Feed page: the library's papers as cards (a figure when the paper's license allows it, the lab, journal and
// date, a synopsis and links), newest first, filtered by topic. Data: feed.json (written by the site build from
// scripts/build_feed.py's synopses and figures). Cards are added 15 at a time as you scroll.
//   feed.html?topics=<topic>,<topic>   open with these topics selected
// The topic choice and the sort are remembered in this browser.
(function () {
  const root = document.getElementById("pl-feed");
  if (!root) return;
  const base = (document.currentScript && document.currentScript.src.replace(/feed\.js.*$/, "")) || "_static/library/";
  const site = base.replace(/_static\/library\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered */ } },
  };
  const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
  const when = (d) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(d || "")) return d || "";
    const days = Math.round((Date.now() - new Date(d + "T12:00:00")) / 864e5);
    const date = new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : date;
  };
  const LICENSES = { "cc_by": "CC BY", "cc-by": "CC BY", "cc_by_nc": "CC BY-NC", "cc-by-nc": "CC BY-NC", "cc_by_sa": "CC BY-SA",
                     "cc-by-sa": "CC BY-SA", "cc_by_nc_sa": "CC BY-NC-SA", "cc-by-nc-sa": "CC BY-NC-SA", "cc0": "CC0", "cc_0": "CC0",
                     "public-domain": "public domain" };
  const PAGE = 15;

  let items = [], shown = 0;
  const saved = (() => { try { return JSON.parse(store.get("pl-feed") || "{}"); } catch { return {}; } })();
  const state = { topics: new Set(saved.topics || []), sort: saved.sort === "added" ? "added" : "date" };
  const q = new URLSearchParams(location.search);
  if (q.has("topics")) state.topics = new Set((q.get("topics") || "").split(",").filter(Boolean));
  const remember = () => store.set("pl-feed", JSON.stringify({ topics: [...state.topics], sort: state.sort }));

  root.innerHTML = `
    <div class="pl-feed-bar">
      <div class="pl-pod-chips" id="feed-topics" role="group" aria-label="Topics"></div>
      <div class="pl-feed-sort"><span id="feed-count" class="pl-pod-meta"></span>
        <label>Sort <select id="feed-sort" aria-label="Sort the feed"><option value="date">Newest published</option>
          <option value="added">Recently added</option></select></label></div>
    </div>
    <div class="pl-feed" id="feed-list" aria-live="polite"></div>
    <div id="feed-more" class="pl-feed-more"></div>`;
  const $ = (id) => document.getElementById(id);

  function filtered() {
    const xs = items.filter(x => !state.topics.size || x.topics.some(t => state.topics.has(slug(t))));
    const by = state.sort === "added" ? (a, b) => (b.added || "").localeCompare(a.added || "") || (b.date || "").localeCompare(a.date || "")
                                      : (a, b) => (b.date || "").localeCompare(a.date || "") || (b.added || "").localeCompare(a.added || "");
    return xs.sort(by);
  }
  function card(x) {
    const preprint = x.badges.some(b => b.label === "Preprint");
    const url = x.doi ? `https://doi.org/${encodeURI(x.doi)}` : null;
    const badges = x.badges.filter(b => b.kind === "highlight" || b.kind === "member").map(b =>
      `<span class="pl-badge pl-k-${esc(b.kind)}">${esc(b.label)}</span>`).join("");
    const fig = x.figure ? `<a class="pl-feed-fig" href="${esc(site + x.figure)}" target="_blank" rel="noopener" title="Open the figure">
        <img src="${esc(site + x.figure)}" alt="A figure from “${esc(x.title)}”" loading="lazy"></a>
        <div class="pl-feed-credit">Figure from the paper${LICENSES[x.license] ? ` (${LICENSES[x.license]})` : ""}</div>` : "";
    const links = [
      url && `<a href="${esc(url)}" target="_blank" rel="noopener">${preprint ? "Preprint" : "Paper"}</a>`,
      x.pdf_url && `<a href="${esc(x.pdf_url)}" target="_blank" rel="noopener" title="On the library server (password)">PDF 🔒</a>`,
      x.episode && `<a href="${esc(site)}podcast.html?d=${esc(x.episode.d)}&t=${esc(x.episode.t)}${x.episode.at != null
        ? `&at=${x.episode.at}" title="Plays from where this paper is discussed">🎧 Listen (${clock(x.episode.at)})` : `">🎧 Listen`}</a>`,
    ].filter(Boolean).join("");
    return `<article class="pl-feed-card${x.figure ? "" : " nofig"}">
      ${fig}
      <div class="pl-feed-body">
        <div class="pl-feed-topics">${x.topics.map(t => `<a href="${esc(site)}topics/${slug(t)}/papers.html">${esc(t)}</a>`).join("")}</div>
        <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}</h3>
        <div class="pl-feed-meta">${esc([x.lab && x.lab.replace(/^the /, "The "), x.source, when(x.date)].filter(Boolean).join(" · "))}
          ${preprint ? '<span class="pl-badge pl-k-status">Preprint</span>' : ""}${badges}</div>
        <p>${esc(x.synopsis)}</p>
        <div class="pl-feed-links">${links}</div>
      </div>
    </article>`;
  }

  function renderTopics() {
    const names = [...new Set(items.flatMap(x => x.topics))];
    const order = names.map(n => [n, items.filter(x => x.topics.includes(n)).length]);
    const chip = (v, label, on) => `<button type="button" class="pl-pod-chip${on ? " on" : ""}" data-value="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
    $("feed-topics").innerHTML = chip("", "All topics", !state.topics.size) +
      order.map(([n, c]) => chip(slug(n), `${n} (${c})`, state.topics.has(slug(n)))).join("");
  }
  function render() {
    const xs = filtered();
    shown = Math.min(PAGE, xs.length);
    $("feed-list").innerHTML = xs.slice(0, shown).map(card).join("") || `<p class="pl-pod-none">No papers in these topics.</p>`;
    $("feed-count").textContent = `${xs.length} paper${xs.length === 1 ? "" : "s"}`;
    $("feed-sort").value = state.sort;
    more();
  }
  function more() {
    const xs = filtered();
    $("feed-more").innerHTML = shown < xs.length ? `<button type="button" class="pl-pod-skip" id="feed-next">Show more</button>` : "";
  }
  function loadMore() {
    const xs = filtered();
    if (shown >= xs.length) return;
    $("feed-list").insertAdjacentHTML("beforeend", xs.slice(shown, shown + PAGE).map(card).join(""));
    shown = Math.min(shown + PAGE, xs.length);
    more();
  }

  $("feed-topics").onclick = (e) => {
    const b = e.target.closest(".pl-pod-chip");
    if (!b) return;
    const v = b.dataset.value;
    if (!v) state.topics.clear(); else if (state.topics.has(v)) state.topics.delete(v); else state.topics.add(v);
    remember(); renderTopics(); render();
  };
  $("feed-sort").onchange = () => { state.sort = $("feed-sort").value; remember(); render(); };
  $("feed-more").onclick = (e) => { if (e.target.closest("#feed-next")) loadMore(); };
  if ("IntersectionObserver" in window) {  // more cards as the end of the list comes into view
    new IntersectionObserver((es) => { if (es.some(x => x.isIntersecting)) loadMore(); }, { rootMargin: "600px" }).observe($("feed-more"));
  }

  fetch(base + "feed.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    items = d;
    const known = new Set(items.flatMap(x => x.topics).map(slug));
    state.topics = new Set([...state.topics].filter(t => known.has(t)));
    renderTopics();
    render();
  }).catch(() => { $("feed-list").innerHTML = `<p class="pl-pod-none">The feed could not be loaded.</p>`; });
})();
