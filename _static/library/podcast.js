// The Podcast page: a player for the daily topic episodes, a playlist per day that plays one episode after the other,
// and a navigation bar to move between the topics of a day and the days of a topic.
//   podcast.html?d=<date>&t=<topic slug>   a daily topic episode (no parameters: the latest day's first topic)
//   podcast.html?e=<key>                   a subscriber's episode (the link in the email), with a chapter per topic
// Episodes and their show notes are published next to this page (_static/podcasts/, listed in podcasts.json by the
// site build); copies are in Google Drive (Paper Library › Podcasts). The speed, "play next automatically" and where
// you stopped in each episode are remembered in this browser.
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

  root.innerHTML = `
    <div class="pl-pod">
      <div class="pl-pod-head"><h2 id="pod-title">Loading…</h2><div class="pl-pod-meta" id="pod-meta"></div></div>
      <audio id="pod-audio" preload="metadata"></audio>
      <div class="pl-pod-controls">
        <button class="pl-pod-skip" id="pod-prev" aria-label="Previous episode" title="Previous episode">⏮</button>
        <button class="pl-pod-skip" id="pod-back" aria-label="Back 15 seconds" title="Back 15 s (←)">↺ 15</button>
        <button class="pl-pod-play" id="pod-play" aria-label="Play">▶</button>
        <button class="pl-pod-skip" id="pod-fwd" aria-label="Forward 30 seconds" title="Forward 30 s (→)">30 ↻</button>
        <button class="pl-pod-skip" id="pod-next" aria-label="Next episode" title="Next episode (N)">⏭</button>
        <label class="pl-pod-speed">Speed <select id="pod-speed" aria-label="Playback speed">
          ${[0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}">${v}×</option>`).join("")}</select></label>
      </div>
      <div class="pl-pod-bar">
        <span id="pod-now">0:00</span>
        <div class="pl-pod-track"><input type="range" id="pod-seek" min="0" max="0" step="1" value="0" aria-label="Position">
          <div class="pl-pod-ticks" id="pod-ticks" aria-hidden="true"></div></div>
        <span id="pod-total">–:––</span>
      </div>
      <label class="pl-pod-auto"><input type="checkbox" id="pod-auto"> Play the next episode automatically</label>
      <div class="pl-pod-resume" id="pod-resume" hidden></div>
      <div class="pl-pod-error" id="pod-error" hidden></div>
      <nav class="pl-pod-nav" id="pod-nav" aria-label="Episodes" hidden>
        <div class="pl-pod-navrow"><span class="pl-pod-navlabel">Same day</span>
          <button type="button" id="nav-topic-prev" aria-label="Previous topic this day" title="Previous topic">◀</button>
          <select id="nav-topic" aria-label="Topic"></select>
          <button type="button" id="nav-topic-next" aria-label="Next topic this day" title="Next topic">▶</button></div>
        <div class="pl-pod-navrow"><span class="pl-pod-navlabel">Same topic</span>
          <button type="button" id="nav-day-prev" aria-label="Earlier day with this topic" title="Earlier day">◀</button>
          <select id="nav-day" aria-label="Day"></select>
          <button type="button" id="nav-day-next" aria-label="Later day with this topic" title="Later day">▶</button></div>
      </nav>
      <div id="pod-playlist"></div>
      <div id="pod-notes"></div>
      <p class="pl-pod-foot"><a id="pod-download" href="#" download>Download (MP3)</a><span id="pod-drive"></span>
        · Keys: space play/pause, ← → skip, N next episode</p>
      <div id="pod-others"></div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const audio = $("pod-audio");
  let index = { daily: [], episodes: [] };
  let current = null;  // {kind: "daily", date, slug} or {kind: "episode", e}
  let chapters = [];
  let dragging = false, resumed = false, lastSave = 0;

  // ---- the episode lists ----
  const daysOf = () => [...new Set(index.daily.map(x => x.date))];                    // newest first
  const dayList = (date) => index.daily.filter(x => x.date === date);                 // in the topics' order
  const topicDays = (slug) => index.daily.filter(x => x.slug === slug).map(x => x.date);
  const playlist = () => current.kind === "daily" ? dayList(current.date) : index.episodes;
  const position = () => playlist().findIndex(x => current.kind === "daily" ? x.slug === current.slug : x.e === current.e);
  const keyOf = (c) => c.kind === "daily" ? `${c.date}/${c.slug}` : c.e;

  // ---- loading an episode ----
  function load(c, autoplay) {
    current = c;
    const path = c.kind === "daily" ? `${files}daily/${c.date}/${c.slug}` : `${files}${c.e}`;
    history.replaceState(null, "", c.kind === "daily" ? `?d=${c.date}&t=${encodeURIComponent(c.slug)}` : `?e=${encodeURIComponent(c.e)}`);
    $("pod-error").hidden = true;
    $("pod-resume").hidden = true;
    resumed = false;
    chapters = [];
    audio.src = path + ".mp3";
    audio.playbackRate = parseFloat($("pod-speed").value);
    $("pod-download").href = path + ".mp3";
    $("pod-drive").innerHTML = "";
    $("pod-title").textContent = "Loading…";
    $("pod-meta").textContent = "";
    if (autoplay) audio.play().catch(() => { /* the browser wants a click first */ });
    renderNav();
    renderOthers();
    fetch(path + ".json").then(r => r.json()).then(n => {
      if (keyOf(current) !== keyOf(c)) return;  // another episode was chosen meanwhile
      chapters = n.chapters || [];
      const papers = chapters.reduce((t, ch) => t + (ch.papers || []).length, 0);
      $("pod-title").textContent = c.kind === "daily" ? n.topic : n.title;
      $("pod-meta").textContent = [c.kind === "daily" && dayName(n.date), `${Math.round((n.seconds || 0) / 6) / 10} min`,
                                   `${papers} paper${papers === 1 ? "" : "s"}`, n.hosts && `with ${n.hosts.join(" and ")}`]
                                   .filter(Boolean).join(" · ");
      document.title = `${$("pod-title").textContent} · Paper Library podcast`;
      if (n.drive) $("pod-drive").innerHTML = ` · <a href="${esc(n.drive)}" target="_blank" rel="noopener">Open in Google Drive</a>`;
      renderNotes(c.kind === "daily");
      drawTicks();
      if ("mediaSession" in navigator && window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: $("pod-title").textContent,
          artist: "Paper Library podcast", album: c.kind === "daily" ? dayName(n.date) : "Elkon lab" });
      }
    }).catch(() => { $("pod-notes").innerHTML = ""; $("pod-title").textContent = "Paper Library podcast"; });
  }

  function step(delta, autoplay) {  // the previous or next episode in the playlist
    const list = playlist(), i = position() + delta;
    if (i < 0 || i >= list.length) return false;
    load(current.kind === "daily" ? { kind: "daily", date: current.date, slug: list[i].slug } : { kind: "episode", e: list[i].e }, autoplay);
    return true;
  }
  function goDay(date, autoplay) {  // that day's episode of the same topic, or else the day's first topic
    const list = dayList(date);
    if (!list.length) return;
    const same = list.find(x => x.slug === current.slug);
    load({ kind: "daily", date, slug: (same || list[0]).slug }, autoplay);
  }

  // ---- navigation bar, playlist, show notes ----
  function renderNav() {
    const daily = current.kind === "daily", i = position();
    $("pod-nav").hidden = !daily;
    $("pod-prev").disabled = i <= 0;
    $("pod-next").disabled = i < 0 || i >= playlist().length - 1;
    if (daily) {
      const today = dayList(current.date);
      $("nav-topic").innerHTML = today.map(x => `<option value="${esc(x.slug)}"${x.slug === current.slug ? " selected" : ""}>${esc(x.topic)}</option>`).join("");
      $("nav-topic-prev").disabled = i <= 0;
      $("nav-topic-next").disabled = i >= today.length - 1;
      const days = topicDays(current.slug), j = days.indexOf(current.date);  // newest first
      $("nav-day").innerHTML = daysOf().map(d => `<option value="${d}"${d === current.date ? " selected" : ""}>${esc(shortDay(d))}${
        days.includes(d) ? "" : " (other topics)"}</option>`).join("");
      $("nav-day-prev").disabled = j < 0 || j >= days.length - 1;
      $("nav-day-next").disabled = j <= 0;
    }
    renderPlaylist();
  }
  function renderPlaylist() {
    if (current.kind !== "daily") { $("pod-playlist").innerHTML = ""; return; }
    const list = dayList(current.date), total = list.reduce((t, x) => t + x.minutes, 0);
    $("pod-playlist").innerHTML = `<h3 class="pl-pod-h">Playlist · ${esc(dayName(current.date))}
        <span class="pl-pod-meta">${list.length} topic${list.length === 1 ? "" : "s"} · ${Math.round(total)} min</span></h3>
      <ol class="pl-pod-list">${list.map((x, i) => `<li${x.slug === current.slug ? ' class="on" aria-current="true"' : ""}>
        <button type="button" data-slug="${esc(x.slug)}"><span class="pl-pod-n">${i + 1}</span>
          <span class="pl-pod-ch-name">${esc(x.topic)}</span>
          <span class="pl-pod-meta">${x.papers} paper${x.papers === 1 ? "" : "s"} · ${x.minutes} min</span></button></li>`).join("")}</ol>`;
  }
  function renderNotes(daily) {
    $("pod-notes").innerHTML = `<h3 class="pl-pod-h">${daily ? "Papers in this episode" : "Chapters"}</h3>
      <ol class="pl-pod-chapters">${chapters.map((c, i) => `<li>
        ${daily ? "" : `<button type="button" class="pl-pod-ch" data-i="${i}"><span class="pl-pod-ch-t">${clock(c.start)}</span>
          <span class="pl-pod-ch-name">${esc(c.title)}</span></button>`}
        ${(c.papers || []).length ? `<ul class="pl-pod-papers${daily ? " flat" : ""}">${c.papers.map(p => `<li>${p.url
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

  const playing = () => !audio.paused;
  $("nav-topic").onchange = () => load({ kind: "daily", date: current.date, slug: $("nav-topic").value }, playing());
  $("nav-topic-prev").onclick = () => step(-1, playing());
  $("nav-topic-next").onclick = () => step(1, playing());
  $("nav-day").onchange = () => goDay($("nav-day").value, playing());
  $("nav-day-prev").onclick = () => { const d = topicDays(current.slug); goDay(d[d.indexOf(current.date) + 1], playing()); };
  $("nav-day-next").onclick = () => { const d = topicDays(current.slug); goDay(d[d.indexOf(current.date) - 1], playing()); };
  $("pod-prev").onclick = () => step(-1, playing());
  $("pod-next").onclick = () => step(1, playing());
  $("pod-playlist").onclick = (e) => {
    const b = e.target.closest("button[data-slug]");
    if (b) load({ kind: "daily", date: current.date, slug: b.dataset.slug }, true);
  };
  $("pod-notes").onclick = (e) => {
    const b = e.target.closest(".pl-pod-ch");
    if (b && chapters[+b.dataset.i]) { audio.currentTime = chapters[+b.dataset.i].start; if (audio.paused) audio.play(); }
  };
  $("pod-others").onclick = (e) => {
    const a = e.target.closest("a[data-e]");
    if (a) { e.preventDefault(); load({ kind: "episode", e: a.dataset.e }, true); }
  };

  // ---- playback ----
  $("pod-speed").value = String(parseFloat(store.get("pl-podcast-speed")) || 1);
  $("pod-speed").onchange = () => { audio.playbackRate = parseFloat($("pod-speed").value); store.set("pl-podcast-speed", $("pod-speed").value); };
  $("pod-auto").checked = store.get("pl-podcast-auto") !== "0";
  $("pod-auto").onchange = () => store.set("pl-podcast-auto", $("pod-auto").checked ? "1" : "0");
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
    if ($("pod-auto").checked) step(1, true);  // the next episode in the playlist
  });
  $("pod-seek").addEventListener("input", () => { dragging = true; $("pod-now").textContent = clock($("pod-seek").value); });
  $("pod-seek").addEventListener("change", () => { audio.currentTime = +$("pod-seek").value; dragging = false; });
  audio.addEventListener("loadedmetadata", () => {
    $("pod-seek").max = Math.floor(audio.duration);
    $("pod-total").textContent = clock(audio.duration);
    drawTicks();
    const saved = parseFloat(store.get(`pl-podcast-pos:${keyOf(current)}`));
    if (!resumed && saved > 10 && saved < audio.duration - 10) {  // where you stopped last time
      resumed = true;
      audio.currentTime = saved;
      $("pod-resume").hidden = false;
      $("pod-resume").innerHTML = `Resuming at ${clock(saved)}. <button type="button" id="pod-restart">Start from the beginning</button>`;
      $("pod-restart").onclick = () => { audio.currentTime = 0; $("pod-resume").hidden = true; };
    }
  });
  audio.addEventListener("timeupdate", () => {
    if (!dragging) { $("pod-seek").value = Math.floor(audio.currentTime); $("pod-now").textContent = clock(audio.currentTime); }
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

  // ---- start: the episode in the address, or the latest day's first topic ----
  fetch(base + "podcasts.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => {
    index = { daily: d.daily || [], episodes: d.episodes || [] };
    const q = new URLSearchParams(location.search), day = q.get("d");
    if (q.get("e") && /^[\w-]+$/.test(q.get("e"))) load({ kind: "episode", e: q.get("e") }, false);
    else if (day && index.daily.some(x => x.date === day && x.slug === q.get("t"))) load({ kind: "daily", date: day, slug: q.get("t") }, false);
    else if (day && dayList(day).length) load({ kind: "daily", date: day, slug: dayList(day)[0].slug }, false);
    else if (index.daily.length) load({ kind: "daily", date: index.daily[0].date, slug: index.daily[0].slug }, false);
    else if (index.episodes.length) load({ kind: "episode", e: index.episodes[0].e }, false);
    else root.innerHTML = `<p class="pl-pod-empty">No episodes yet: the first ones arrive after the next morning scan.</p>`;
  });
})();
