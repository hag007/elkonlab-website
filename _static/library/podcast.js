// The Podcast page: a player for the daily topic episodes. Filter the episodes by day and topic; the filtered episodes
// form a list that can be sorted (or put in any order by dragging or with the ↑ ↓ buttons), and the player plays
// them in the list's order, one after the other.
//   podcast.html?d=<date>&t=<topic slug>   start with that daily topic episode (&at=<seconds>: at that moment, e.g.
//                                          where a paper starts: the Feed's links)
//   podcast.html?e=<key>                   a subscriber's episode (the link in the email), with a chapter per topic
//   podcast.html?from=<date>&to=<date>&topics=<slug>,<slug>   open with these filters (the digest emails' link);
//                                          either date may be left out, and no topics = all topics
// Episodes and their show notes are published next to this page (_static/podcasts/, listed in podcasts.json by the
// site build); copies are in Google Drive (Paper Library › Podcasts). The filters, order, speed and where you
// stopped in each episode are remembered in this browser; "play next automatically" is on whenever the page opens.
(function () {
  const root = document.getElementById("pl-podcast");
  if (!root) return;
  const base = (document.currentScript && document.currentScript.src.replace(/podcast\.js.*$/, "")) || "_static/library/";
  const files = base.replace(/library\/$/, "podcasts/");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: not remembered */ } },
  };
  const clock = (t) => {
    t = Math.max(0, Math.floor(t || 0));
    const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  };
  const dayName = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const shortDay = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const SORTS = { newest: "Newest first", oldest: "Oldest first", topic: "By topic", az: "Topic A–Z", shortest: "Shortest first",
                  custom: "My order" };

  root.innerHTML = `
    <div class="pl-pod">
      <div class="pl-pod-head"><h2 id="pod-title">Loading…</h2><div class="pl-pod-meta" id="pod-meta"></div></div>
      <audio id="pod-audio" preload="metadata"></audio>
      <div class="pl-pod-controls">
        <button class="pl-pod-skip" id="pod-prev" aria-label="Previous in the list" title="Previous in the list">⏮</button>
        <button class="pl-pod-skip" id="pod-back" aria-label="Back 15 seconds" title="Back 15 s (←)">↺ 15</button>
        <button class="pl-pod-play" id="pod-play" aria-label="Play">▶</button>
        <button class="pl-pod-skip" id="pod-fwd" aria-label="Forward 30 seconds" title="Forward 30 s (→)">30 ↻</button>
        <button class="pl-pod-skip" id="pod-next" aria-label="Next in the list" title="Next in the list (N)">⏭</button>
        <label class="pl-pod-speed">Speed <select id="pod-speed" aria-label="Playback speed">
          ${[0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}">${v}×</option>`).join("")}</select></label>
      </div>
      <div class="pl-pod-bar">
        <span id="pod-now">0:00</span>
        <div class="pl-pod-track"><input type="range" id="pod-seek" min="0" max="0" step="1" value="0" aria-label="Position">
          <div class="pl-pod-ticks" id="pod-ticks" aria-hidden="true"></div></div>
        <span id="pod-total">–:––</span>
      </div>
      <label class="pl-pod-auto"><input type="checkbox" id="pod-auto" checked> Play the next episode in the list automatically</label>
      <div class="pl-pod-resume" id="pod-resume" hidden></div>
      <div class="pl-pod-error" id="pod-error" hidden></div>
      <details class="pl-pod-transcript" id="pod-transcript" open hidden>
        <summary>Transcript</summary>
        <label class="pl-pod-follow"><input type="checkbox" id="pod-follow" checked> Follow along</label>
        <ol class="pl-pod-lines" id="pod-lines" aria-label="Transcript: click a line to play from there"></ol>
      </details>
      <div id="pod-notes"></div>
      <section class="pl-pod-filters" id="pod-filters" aria-label="Filter the episodes" hidden>
        <div class="pl-pod-frow"><span class="pl-pod-flabel" id="f-days-l">Days</span>
          <div class="pl-pod-days"><div class="pl-pod-chips" id="f-days" role="group" aria-labelledby="f-days-l"></div>
            <div class="pl-pod-range" id="f-range" hidden>
              <label>From <input type="date" id="f-from"></label><label>To <input type="date" id="f-to"></label></div></div></div>
        <div class="pl-pod-frow"><span class="pl-pod-flabel" id="f-topics-l">Topics</span>
          <div class="pl-pod-chips" id="f-topics" role="group" aria-labelledby="f-topics-l"></div></div>
      </section>
      <div class="pl-pod-listhead" id="pod-listhead" hidden>
        <h3 class="pl-pod-h" id="pod-count"></h3>
        <label class="pl-pod-sort">Sort <select id="pod-sort" aria-label="Sort the list">
          ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      </div>
      <ol class="pl-pod-list" id="pod-list"></ol>
      <p class="pl-pod-foot"><a id="pod-download" href="#" download>Download (MP3)</a><span id="pod-drive"></span>
        · Keys: space play/pause, ← → skip, N next in the list</p>
      <div id="pod-others"></div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const audio = $("pod-audio");
  let index = { daily: [], episodes: [] };
  let current = null;  // {kind: "daily", date, slug} or {kind: "episode", e}
  let chapters = [];
  let dragging = false, resumed = false, lastSave = 0;
  const keyOf = (c) => c.kind === "daily" ? `${c.date}/${c.slug}` : c.e;

  // ---- filters, sorting and the list (the play queue) ----
  // Days: a range, so the filter stays short however many days there are (presets count back from today).
  const RANGES = { today: "Today", d2: "Last 2 days", d3: "Last 3 days", week: "This week", w2: "Last 2 weeks", all: "All days" };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  function span(r) {  // [from, to] dates, "" = open
    if (r === "today") return [daysAgo(0), ""];
    if (r === "d2") return [daysAgo(1), ""];
    if (r === "d3") return [daysAgo(2), ""];
    if (r === "week") return [daysAgo((new Date().getDay() + 6) % 7), ""];  // since Monday
    if (r === "w2") return [daysAgo(13), ""];
    if (r === "custom") return [state.from, state.to];
    return ["", ""];
  }
  const saved = (() => { try { return JSON.parse(store.get("pl-podcast-list") || "{}"); } catch { return {}; } })();
  const state = { range: RANGES[saved.range] || saved.range === "custom" ? saved.range : "all", from: saved.from || "",
                  to: saved.to || "", topics: new Set(saved.topics || []),  // topics: empty = all
                  sort: SORTS[saved.sort] ? saved.sort : "newest", order: saved.order || [] };
  const remember = () => store.set("pl-podcast-list", JSON.stringify({ range: state.range, from: state.from, to: state.to,
                                                                       topics: [...state.topics],
                                                                       sort: state.sort, order: state.order }));
  let rank = {};  // topic slug -> its place in the library's topic order
  function list() {
    const [from, to] = span(state.range);
    let xs = index.daily.filter(x => (!from || x.date >= from) && (!to || x.date <= to) && (!state.topics.size || state.topics.has(x.slug)));
    const k = (x) => `${x.date}/${x.slug}`;
    const by = {
      newest: (a, b) => b.date.localeCompare(a.date) || rank[a.slug] - rank[b.slug],
      oldest: (a, b) => a.date.localeCompare(b.date) || rank[a.slug] - rank[b.slug],
      topic: (a, b) => rank[a.slug] - rank[b.slug] || b.date.localeCompare(a.date),
      az: (a, b) => a.topic.localeCompare(b.topic) || b.date.localeCompare(a.date),
      shortest: (a, b) => a.minutes - b.minutes,
    };
    if (state.sort === "custom") {  // your order; episodes not placed yet go at the end, newest first
      const pos = new Map(state.order.map((key, i) => [key, i]));
      return xs.sort((a, b) => (pos.has(k(a)) ? pos.get(k(a)) : 1e6) - (pos.has(k(b)) ? pos.get(k(b)) : 1e6) || by.newest(a, b));
    }
    return xs.sort(by[state.sort]);
  }
  const queue = () => current && current.kind === "episode" ? index.episodes.map(e => ({ e: e.e })) : list();
  const position = () => queue().findIndex(x => current.kind === "daily" ? x.date === current.date && x.slug === current.slug : x.e === current.e);

  function renderFilters() {
    const days = [...new Set(index.daily.map(x => x.date))].sort().reverse();
    const topics = [...new Map(index.daily.map(x => [x.slug, x.topic])).entries()].sort((a, b) => rank[a[0]] - rank[b[0]]);
    const chip = (group, value, label, on) => `<button type="button" class="pl-pod-chip${on ? " on" : ""}" data-group="${group}"
      data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    const count = (r) => { const [f, t] = span(r); return index.daily.filter(x => (!f || x.date >= f) && (!t || x.date <= t)).length; };
    $("f-days").innerHTML = Object.entries(RANGES).map(([r, label]) => chip("range", r, `${label} (${count(r)})`, state.range === r)).join("")
      + chip("range", "custom", "Custom…", state.range === "custom");
    $("f-range").hidden = state.range !== "custom";
    for (const id of ["f-from", "f-to"]) { $(id).min = days[days.length - 1] || ""; $(id).max = days[0] || ""; }
    $("f-from").value = state.from; $("f-to").value = state.to;
    $("f-topics").innerHTML = chip("topics", "", "All topics", !state.topics.size) + topics.map(([s, t]) => chip("topics", s, t, state.topics.has(s))).join("");
  }
  function renderList() {
    const xs = list(), total = xs.reduce((t, x) => t + x.minutes, 0);
    $("pod-sort").value = state.sort;
    $("pod-count").innerHTML = `${xs.length} episode${xs.length === 1 ? "" : "s"} <span class="pl-pod-meta">· ${Math.round(total)} min · plays in this order</span>`;
    const playingNow = (x) => current && current.kind === "daily" && x.date === current.date && x.slug === current.slug;
    $("pod-list").innerHTML = xs.map((x, i) => `<li draggable="true" data-key="${esc(x.date + "/" + x.slug)}"${playingNow(x) ? ' class="on" aria-current="true"' : ""}>
        <span class="pl-pod-grip" aria-hidden="true" title="Drag to reorder">⠿</span>
        <button type="button" class="pl-pod-item" data-key="${esc(x.date + "/" + x.slug)}"><span class="pl-pod-n">${i + 1}</span>
          <span class="pl-pod-ch-name">${esc(x.topic)}</span>
          <span class="pl-pod-meta">${esc(shortDay(x.date))} · ${x.papers} paper${x.papers === 1 ? "" : "s"} · ${x.minutes} min</span></button>
        <span class="pl-pod-move"><button type="button" data-move="-1" aria-label="Move ${esc(x.topic)}, ${esc(shortDay(x.date))} up" ${i ? "" : "disabled"}>↑</button><button
          type="button" data-move="1" aria-label="Move ${esc(x.topic)}, ${esc(shortDay(x.date))} down" ${i < xs.length - 1 ? "" : "disabled"}>↓</button></span>
      </li>`).join("") || `<li class="pl-pod-none">No episodes match these filters.</li>`;
    $("pod-prev").disabled = position() <= 0;
    $("pod-next").disabled = position() < 0 ? !queue().length : position() >= queue().length - 1;
  }
  function changed() { remember(); renderFilters(); renderList(); }
  function moveTo(fromKey, toIndex) {  // a custom order: the list as shown, with one episode moved
    const keys = list().map(x => `${x.date}/${x.slug}`), from = keys.indexOf(fromKey);
    if (from < 0 || toIndex < 0 || toIndex >= keys.length) return;
    keys.splice(toIndex, 0, keys.splice(from, 1)[0]);
    state.order = [...keys, ...state.order.filter(k => !keys.includes(k))];
    state.sort = "custom";
    changed();
  }

  $("pod-filters").onclick = (e) => {
    const b = e.target.closest(".pl-pod-chip");
    if (!b) return;
    const v = b.dataset.value;
    if (b.dataset.group === "range") {  // one range at a time
      state.range = v;
      if (v === "custom" && !state.from && !state.to) state.from = state.to = $("f-from").max;  // start with the latest day
    } else {
      const set = state.topics;
      if (!v) set.clear();                               // "All topics"
      else if (set.has(v)) set.delete(v); else set.add(v);  // several topics at once
    }
    changed();
  };
  $("pod-sort").onchange = () => { state.sort = $("pod-sort").value; changed(); };
  for (const id of ["f-from", "f-to"]) {
    $(id).addEventListener("change", () => {
      state.from = $("f-from").value; state.to = $("f-to").value;
      if (state.from && state.to && state.from > state.to) [state.from, state.to] = [state.to, state.from];
      changed();
    });
  }
  $("pod-list").onclick = (e) => {
    const mv = e.target.closest("button[data-move]");
    if (mv) {
      const li = mv.closest("li"), keys = list().map(x => `${x.date}/${x.slug}`);
      moveTo(li.dataset.key, keys.indexOf(li.dataset.key) + +mv.dataset.move);
      const again = $("pod-list").querySelector(`li[data-key="${CSS.escape(li.dataset.key)}"] button[data-move="${mv.dataset.move}"]`);
      (again && !again.disabled ? again : $("pod-list").querySelector(`li[data-key="${CSS.escape(li.dataset.key)}"] .pl-pod-item`))?.focus();
      return;
    }
    const b = e.target.closest(".pl-pod-item");
    if (b) { const [date, slug] = b.dataset.key.split("/"); load({ kind: "daily", date, slug }, true); }
  };
  let dragKey = null;  // drag and drop to reorder
  $("pod-list").addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-key]");
    if (!li) return;
    dragKey = li.dataset.key;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragKey);
  });
  $("pod-list").addEventListener("dragover", (e) => {
    if (!dragKey) return;
    e.preventDefault();
    const li = e.target.closest("li[data-key]");
    $("pod-list").querySelectorAll(".drop-before, .drop-after").forEach(x => x.classList.remove("drop-before", "drop-after"));
    if (li && li.dataset.key !== dragKey) {
      const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
      li.classList.add(after ? "drop-after" : "drop-before");
    }
  });
  $("pod-list").addEventListener("drop", (e) => {
    e.preventDefault();
    const li = e.target.closest("li[data-key]");
    if (!dragKey || !li || li.dataset.key === dragKey) return;
    const keys = list().map(x => `${x.date}/${x.slug}`).filter(k => k !== dragKey);
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    const target = keys.indexOf(li.dataset.key) + (after ? 1 : 0);
    const k = dragKey;
    dragKey = null;
    moveTo(k, target);
  });
  $("pod-list").addEventListener("dragend", () => {
    dragKey = null;
    $("pod-list").querySelectorAll(".dragging, .drop-before, .drop-after").forEach(x => x.classList.remove("dragging", "drop-before", "drop-after"));
  });

  // ---- loading an episode ----
  let startAt = null;  // a moment to start at (?at=, or a paper's time clicked): wins over "where you stopped"
  function load(c, autoplay, at) {
    startAt = at == null ? null : at;
    current = c;
    const path = c.kind === "daily" ? `${files}daily/${c.date}/${c.slug}` : `${files}${c.e}`;
    history.replaceState(null, "", c.kind === "daily" ? `?d=${c.date}&t=${encodeURIComponent(c.slug)}` : `?e=${encodeURIComponent(c.e)}`);
    $("pod-error").hidden = true;
    $("pod-resume").hidden = true;
    resumed = false;
    chapters = [];
    lines = [];
    $("pod-transcript").hidden = true;
    audio.src = path + ".mp3";
    audio.playbackRate = parseFloat($("pod-speed").value);
    $("pod-download").href = path + ".mp3";
    $("pod-drive").innerHTML = "";
    $("pod-title").textContent = "Loading…";
    $("pod-meta").textContent = "";
    if (autoplay) audio.play().catch(() => { /* the browser wants a click first */ });
    renderList();
    renderOthers();
    fetch(path + ".json").then(r => r.json()).then(n => {
      if (keyOf(current) !== keyOf(c)) return;  // another episode was chosen meanwhile
      chapters = n.chapters || [];
      const papers = chapters.reduce((t, ch) => t + (ch.papers || []).length, 0);
      $("pod-title").textContent = c.kind === "daily" ? n.topic : n.title;
      $("pod-meta").textContent = [c.kind === "daily" && dayName(n.date), `${Math.round((n.seconds || 0) / 6) / 10} min`,
                                   `${papers} paper${papers === 1 ? "" : "s"}`]
                                   .filter(Boolean).join(" · ");
      document.title = `${$("pod-title").textContent} · Paper Library podcast`;
      if (n.drive) $("pod-drive").innerHTML = ` · <a href="${esc(n.drive)}" target="_blank" rel="noopener">Open in Google Drive</a>`;
      renderNotes(c.kind === "daily");
      renderTranscript(n.transcript || []);
      drawTicks();
      if ("mediaSession" in navigator && window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: $("pod-title").textContent,
          artist: "Paper Library podcast", album: c.kind === "daily" ? dayName(n.date) : "Elkon lab" });
      }
    }).catch(() => { $("pod-notes").innerHTML = ""; $("pod-title").textContent = "Paper Library podcast"; });
  }
  function step(delta, autoplay) {  // the previous or next episode in the list (the first one if this one isn't in it)
    const q = queue(), i = position();
    const j = i < 0 ? (delta > 0 ? 0 : -1) : i + delta;
    if (j < 0 || j >= q.length) return false;
    load(current.kind === "daily" || i < 0 ? { kind: "daily", date: q[j].date, slug: q[j].slug } : { kind: "episode", e: q[j].e }, autoplay);
    return true;
  }

  // ---- transcript: the line being spoken is highlighted and kept in view ("Follow along"); click a line to jump ----
  let lines = [], spoken = -1, quietUntil = 0;
  function renderTranscript(xs) {
    lines = xs;
    spoken = -1;
    $("pod-transcript").hidden = !xs.length;
    $("pod-lines").innerHTML = xs.map((x, i) => `<li class="pl-pod-line s${x.s === "B" ? 2 : 1}" data-i="${i}">
      <button type="button" data-t="${x.t}"><span class="pl-pod-line-t">${clock(x.t)}</span><span>${esc(x.text)}</span></button></li>`).join("");
    followLine();
  }
  function followLine() {
    if (!lines.length) return;
    let i = -1;
    for (let lo = 0, hi = lines.length - 1; lo <= hi;) {  // the last line that has started
      const mid = (lo + hi) >> 1;
      if (lines[mid].t <= audio.currentTime + 0.15) { i = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (i === spoken) return;
    $("pod-lines").querySelector(".now")?.classList.remove("now");
    spoken = i;
    const li = i >= 0 && $("pod-lines").children[i];
    if (!li) return;
    li.classList.add("now");
    const box = $("pod-lines");
    if ($("pod-follow").checked && Date.now() > quietUntil) {  // (not while you scroll the transcript yourself)
      box.scrollTo({ top: li.offsetTop - box.clientHeight / 3, behavior: "smooth" });  // (the list is the li offsetParent)
    }
  }
  $("pod-lines").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-t]");
    if (b) { audio.currentTime = +b.dataset.t; if (audio.paused) audio.play(); }
  });
  ["wheel", "touchmove", "keydown"].forEach(ev => $("pod-lines").addEventListener(ev, () => { quietUntil = Date.now() + 5000; }, { passive: true }));

  function renderNotes(daily) {
    $("pod-notes").innerHTML = `<h3 class="pl-pod-h">${daily ? "Papers in this episode" : "Chapters"}</h3>
      <ol class="pl-pod-chapters">${chapters.map((c, i) => `<li>
        ${daily ? "" : `<button type="button" class="pl-pod-ch" data-i="${i}"><span class="pl-pod-ch-t">${clock(c.start)}</span>
          <span class="pl-pod-ch-name">${esc(c.title)}</span></button>`}
        ${(c.papers || []).length ? `<ul class="pl-pod-papers${daily ? " flat" : ""}">${c.papers.map(p => `<li>${p.start != null
            ? `<button type="button" class="pl-pod-at" data-at="${p.start}" title="Play from where this paper starts">▶ ${clock(p.start)}</button> ` : ""}${p.url
            ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}
            <span class="pl-pod-meta">${esc([p.authors, p.source, p.date].filter(Boolean).join(" · "))}</span></li>`).join("")}
          ${c.page ? `<li class="pl-pod-more"><a href="${esc(c.page)}">All ${esc(c.title)} papers →</a></li>` : ""}</ul>` : ""}
      </li>`).join("")}</ol>`;
  }
  function renderOthers() {
    if (!index.episodes.length) { $("pod-others").innerHTML = ""; return; }
    $("pod-others").innerHTML = `<details class="pl-pod-others"${current.kind === "episode" ? " open" : ""}>
      <summary>Subscribers' episodes (${index.episodes.length})</summary>
      <ul class="pl-pod-episodes">${index.episodes.map(e => `<li${current.kind === "episode" && e.e === current.e ? ' class="on"' : ""}>
        <a href="?e=${encodeURIComponent(e.e)}" data-e="${esc(e.e)}">${esc(e.title)}</a>
        <span class="pl-pod-meta">${esc(e.minutes)} min</span></li>`).join("")}</ul></details>`;
  }
  $("pod-notes").onclick = (e) => {
    const t = e.target.closest(".pl-pod-at");  // a paper's timestamp
    if (t) { audio.currentTime = +t.dataset.at; if (audio.paused) audio.play(); return; }
    const b = e.target.closest(".pl-pod-ch");
    if (b && chapters[+b.dataset.i]) { audio.currentTime = chapters[+b.dataset.i].start; if (audio.paused) audio.play(); }
  };
  $("pod-others").onclick = (e) => {
    const a = e.target.closest("a[data-e]");
    if (a) { e.preventDefault(); load({ kind: "episode", e: a.dataset.e }, true); }
  };

  // ---- playback ----
  const playing = () => !audio.paused;
  $("pod-prev").onclick = () => step(-1, playing());
  $("pod-next").onclick = () => step(1, playing());
  $("pod-speed").value = String(parseFloat(store.get("pl-podcast-speed")) || 1);
  $("pod-speed").onchange = () => { audio.playbackRate = parseFloat($("pod-speed").value); store.set("pl-podcast-speed", $("pod-speed").value); };
  const toggle = () => (audio.paused ? audio.play() : audio.pause());
  const skip = (s) => { audio.currentTime = Math.min(Math.max(0, audio.currentTime + s), audio.duration || 1e9); };
  $("pod-play").onclick = toggle;
  $("pod-back").onclick = () => skip(-15);
  $("pod-fwd").onclick = () => skip(30);
  audio.addEventListener("play", () => { $("pod-play").textContent = "❚❚"; $("pod-play").setAttribute("aria-label", "Pause"); });
  audio.addEventListener("pause", () => { $("pod-play").textContent = "▶"; $("pod-play").setAttribute("aria-label", "Play"); });
  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src")) return;
    $("pod-error").hidden = false;
    $("pod-error").textContent = "This episode could not be loaded: the website keeps the last two months of episodes " +
      "(all of them are in Google Drive, Paper Library › Podcasts).";
  });
  audio.addEventListener("ended", () => {
    store.set(`pl-podcast-pos:${keyOf(current)}`, "0");
    if ($("pod-auto").checked) step(1, true);  // the next episode in the list
  });
  $("pod-seek").addEventListener("input", () => { dragging = true; $("pod-now").textContent = clock($("pod-seek").value); });
  $("pod-seek").addEventListener("change", () => { audio.currentTime = +$("pod-seek").value; dragging = false; });
  audio.addEventListener("loadedmetadata", () => {
    $("pod-seek").max = Math.floor(audio.duration);
    $("pod-total").textContent = clock(audio.duration);
    drawTicks();
    const at = parseFloat(store.get(`pl-podcast-pos:${keyOf(current)}`));
    if (startAt != null) {  // a paper's moment
      audio.currentTime = Math.min(startAt, audio.duration - 1);
      startAt = null;
      resumed = true;
    } else if (!resumed && at > 10 && at < audio.duration - 10) {  // where you stopped last time
      resumed = true;
      audio.currentTime = at;
      $("pod-resume").hidden = false;
      $("pod-resume").innerHTML = `Resuming at ${clock(at)}. <button type="button" id="pod-restart">Start from the beginning</button>`;
      $("pod-restart").onclick = () => { audio.currentTime = 0; $("pod-resume").hidden = true; };
    }
  });
  audio.addEventListener("timeupdate", () => {
    if (!dragging) { $("pod-seek").value = Math.floor(audio.currentTime); $("pod-now").textContent = clock(audio.currentTime); }
    followLine();
    if (Math.abs(audio.currentTime - lastSave) > 5) { lastSave = audio.currentTime; store.set(`pl-podcast-pos:${keyOf(current)}`, String(audio.currentTime)); }
  });
  function drawTicks() {
    $("pod-ticks").innerHTML = audio.duration && chapters.length > 1 ? chapters.slice(1).map(c =>
      `<span style="left:${(100 * c.start / audio.duration).toFixed(2)}%"></span>`).join("") : "";
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea") || (e.key === " " && e.target.closest("button, a, summary"))) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowLeft") skip(-15);
    else if (e.key === "ArrowRight") skip(30);
    else if (e.key === "n" || e.key === "N") step(1, playing());
  });
  if ("mediaSession" in navigator) {  // lock-screen and headset buttons
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(30));
    try { ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; }); } catch { /* not supported */ }
    ms.setActionHandler("previoustrack", () => step(-1, true));
    ms.setActionHandler("nexttrack", () => step(1, true));
  }

  // ---- start: the episode in the address, or the first episode of the list ----
  fetch(base + "podcasts.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => {
    index = { daily: d.daily || [], episodes: d.episodes || [] };
    (d.topics || []).forEach((s, i) => { rank[s] = i; });  // the library's topic order
    index.daily.forEach(x => { if (!(x.slug in rank)) rank[x.slug] = Object.keys(rank).length; });
    const known = (set, values) => [...set].filter(v => values.includes(v));  // drop filters for days that are gone
    const q = new URLSearchParams(location.search), day = q.get("d"), isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
    if (q.has("from") || q.has("to") || q.has("topics")) {  // filters from the link (e.g. in the digest email)
      state.range = "custom";
      state.from = isDate(q.get("from")) ? q.get("from") : "";
      state.to = isDate(q.get("to")) ? q.get("to") : "";
      state.topics = new Set((q.get("topics") || "").split(",").filter(Boolean));
      if (state.sort === "custom") state.sort = "topic";  // the email's topics in the library's order
      remember();
    }
    state.topics = new Set(known(state.topics, index.daily.map(x => x.slug)));
    $("pod-filters").hidden = $("pod-listhead").hidden = !index.daily.length;
    renderFilters();
    if (q.get("e") && /^[\w-]+$/.test(q.get("e"))) load({ kind: "episode", e: q.get("e") }, false);
    else if (day && index.daily.some(x => x.date === day && x.slug === q.get("t"))) {
      const at = parseFloat(q.get("at"));
      load({ kind: "daily", date: day, slug: q.get("t") }, false, at >= 0 ? at : null);
    }
    else if (list().length) load({ kind: "daily", date: list()[0].date, slug: list()[0].slug }, false);
    else if (index.daily.length) load({ kind: "daily", date: index.daily[0].date, slug: index.daily[0].slug }, false);
    else if (index.episodes.length) load({ kind: "episode", e: index.episodes[0].e }, false);
    else root.innerHTML = `<p class="pl-pod-empty">No episodes yet: the first ones arrive after the next morning scan.</p>`;
  });
})();
