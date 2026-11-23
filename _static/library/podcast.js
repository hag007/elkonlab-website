// The Podcast page's player: podcast.html?e=<episode key>, or (no episode in the address) the latest episode in
// podcasts.json, the list of episodes that the site build writes. The episodes are published next to this page
// (_static/podcasts/<key>.mp3 and <key>.json, the show notes with a chapter per topic); a copy of each is in Google
// Drive (Paper Library › Podcasts), which can't serve this player itself (it refuses other websites).
// Remembers the speed (all episodes) and where you stopped (per episode) in this browser.
(function () {
  const root = document.getElementById("pl-podcast");
  if (!root) return;
  const params = new URLSearchParams(location.search);
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

  const valid = (id) => /^[\w-]+$/.test(id || "");
  const episodeList = (episodes, current) => episodes.length ? `<h3 class="pl-pod-h">Episodes</h3>
    <ul class="pl-pod-episodes">${episodes.map(e => `<li${e.e === current ? ' class="on"' : ""}>
      <a href="?e=${encodeURIComponent(e.e)}">${esc(e.title)}</a>
      <span class="pl-pod-meta">${esc(e.minutes)} min</span></li>`).join("")}</ul>` : "";
  const listing = fetch(base + "podcasts.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : []).catch(() => []);

  if (valid(params.get("e"))) {
    start(params.get("e"));
    listing.then(eps => { root.insertAdjacentHTML("beforeend", episodeList(eps, params.get("e"))); });
  } else {
    listing.then(eps => {
      if (!eps.length) {
        root.innerHTML = `<p class="pl-pod-empty">No episodes yet. Turn on the podcast in your email alert settings, and
          your first episode arrives with your next email.</p>`;
        return;
      }
      start(eps[0].e);  // the latest episode
      root.insertAdjacentHTML("beforeend", episodeList(eps, eps[0].e));
    });
  }

  function start(episode) {
  root.innerHTML = `
    <div class="pl-pod">
      <div class="pl-pod-head"><h2 id="pod-title">Loading the episode…</h2><div class="pl-pod-meta" id="pod-meta"></div></div>
      <audio id="pod-audio" preload="metadata" src="${esc(files + episode + ".mp3")}"></audio>
      <div class="pl-pod-controls">
        <button class="pl-pod-skip" id="pod-back" aria-label="Back 15 seconds" title="Back 15 s (←)">↺ 15</button>
        <button class="pl-pod-play" id="pod-play" aria-label="Play">▶</button>
        <button class="pl-pod-skip" id="pod-fwd" aria-label="Forward 30 seconds" title="Forward 30 s (→)">30 ↻</button>
        <label class="pl-pod-speed">Speed <select id="pod-speed" aria-label="Playback speed">
          ${[0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}">${v}×</option>`).join("")}</select></label>
      </div>
      <div class="pl-pod-bar">
        <span id="pod-now">0:00</span>
        <div class="pl-pod-track"><input type="range" id="pod-seek" min="0" max="0" step="1" value="0" aria-label="Position">
          <div class="pl-pod-ticks" id="pod-ticks" aria-hidden="true"></div></div>
        <span id="pod-total">–:––</span>
      </div>
      <div class="pl-pod-resume" id="pod-resume" hidden></div>
      <div class="pl-pod-error" id="pod-error" hidden></div>
      <h3 class="pl-pod-h">Chapters</h3>
      <ol class="pl-pod-chapters" id="pod-chapters"><li class="pl-pod-meta">Loading…</li></ol>
      <p class="pl-pod-foot"><a href="${esc(files + episode + ".mp3")}" download>Download (MP3)</a><span id="pod-drive"></span>
        · Keys: space play/pause, ← → skip</p>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const audio = $("pod-audio");
  let chapters = [], title = "Paper Library podcast";
  const posKey = `pl-podcast-pos:${episode}`;

  // Speed: remembered for every episode.
  const speed = parseFloat(store.get("pl-podcast-speed")) || 1;
  $("pod-speed").value = String(speed);
  audio.playbackRate = speed;
  $("pod-speed").onchange = () => { audio.playbackRate = parseFloat($("pod-speed").value); store.set("pl-podcast-speed", $("pod-speed").value); };

  const toggle = () => (audio.paused ? audio.play() : audio.pause());
  const skip = (s) => { audio.currentTime = Math.min(Math.max(0, audio.currentTime + s), audio.duration || 1e9); };
  $("pod-play").onclick = toggle;
  $("pod-back").onclick = () => skip(-15);
  $("pod-fwd").onclick = () => skip(30);
  audio.addEventListener("play", () => { $("pod-play").textContent = "❚❚"; $("pod-play").setAttribute("aria-label", "Pause"); });
  audio.addEventListener("pause", () => { $("pod-play").textContent = "▶"; $("pod-play").setAttribute("aria-label", "Play"); });
  audio.addEventListener("error", () => {
    $("pod-error").hidden = false;
    $("pod-error").innerHTML = `This episode could not be loaded: the website keeps the last two months of episodes.
      Older ones are in Google Drive (Paper Library › Podcasts).`;
  });

  // Seek bar: dragging does not fight with playback updates.
  let dragging = false;
  $("pod-seek").addEventListener("input", () => { dragging = true; $("pod-now").textContent = clock($("pod-seek").value); });
  $("pod-seek").addEventListener("change", () => { audio.currentTime = +$("pod-seek").value; dragging = false; });
  audio.addEventListener("loadedmetadata", () => {
    $("pod-seek").max = Math.floor(audio.duration);
    $("pod-total").textContent = clock(audio.duration);
    drawTicks();
    const saved = parseFloat(store.get(posKey));
    if (saved > 10 && saved < audio.duration - 10) {  // where you stopped last time
      audio.currentTime = saved;
      $("pod-resume").hidden = false;
      $("pod-resume").innerHTML = `Resuming at ${clock(saved)}. <button type="button" id="pod-restart">Start from the beginning</button>`;
      $("pod-restart").onclick = () => { audio.currentTime = 0; $("pod-resume").hidden = true; };
    }
  });
  let lastSave = 0;
  audio.addEventListener("timeupdate", () => {
    if (!dragging) { $("pod-seek").value = Math.floor(audio.currentTime); $("pod-now").textContent = clock(audio.currentTime); }
    markChapter();
    if (Math.abs(audio.currentTime - lastSave) > 5) { lastSave = audio.currentTime; store.set(posKey, String(audio.currentTime)); }
  });
  audio.addEventListener("ended", () => store.set(posKey, "0"));

  // Keyboard: space, arrows (not while typing or on a control that uses them).
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea") || (e.key === " " && e.target.closest("button, a"))) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowLeft") skip(-15);
    else if (e.key === "ArrowRight") skip(30);
  });

  function current() {
    let i = 0;
    chapters.forEach((c, j) => { if (audio.currentTime + 0.5 >= c.start) i = j; });
    return i;
  }
  function markChapter() {
    const i = current();
    document.querySelectorAll("#pod-chapters > li").forEach((li, j) => li.classList.toggle("on", j === i));
  }
  function drawTicks() {
    if (!audio.duration || !chapters.length) return;
    $("pod-ticks").innerHTML = chapters.slice(1).map(c =>
      `<span style="left:${(100 * c.start / audio.duration).toFixed(2)}%"></span>`).join("");
  }
  const jump = (i) => { if (chapters[i]) { audio.currentTime = chapters[i].start; if (audio.paused) audio.play(); } };

  // Lock-screen / headset controls on phones and laptops.
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(30));
    try { ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; }); } catch { /* not supported */ }
    ms.setActionHandler("previoustrack", () => jump(Math.max(0, current() - (audio.currentTime - chapters[current()]?.start > 3 ? 0 : 1))));
    ms.setActionHandler("nexttrack", () => jump(current() + 1));
  }

  fetch(files + episode + ".json").then(r => r.json()).then(n => {
    title = n.title || title;
    chapters = n.chapters || [];
    document.title = `${title} · Paper Library podcast`;
    $("pod-title").textContent = title;
    if (n.drive) $("pod-drive").innerHTML = ` · <a href="${esc(n.drive)}" target="_blank" rel="noopener">Open in Google Drive</a>`;
    const papers = chapters.reduce((t, c) => t + (c.papers || []).length, 0);
    $("pod-meta").textContent = [`${Math.round((n.seconds || 0) / 60)} min`, `${papers} paper${papers === 1 ? "" : "s"}`,
                                 n.hosts && `with ${n.hosts.join(" and ")}`].filter(Boolean).join(" · ");
    $("pod-chapters").innerHTML = chapters.map((c, i) => `<li>
        <button type="button" class="pl-pod-ch" data-i="${i}"><span class="pl-pod-ch-t">${clock(c.start)}</span>
          <span class="pl-pod-ch-name">${esc(c.title)}</span></button>
        ${(c.papers || []).length ? `<ul class="pl-pod-papers">${c.papers.map(p => `<li>${p.url
            ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}
            <span class="pl-pod-meta">${esc([p.authors, p.source, p.date].filter(Boolean).join(" · "))}</span></li>`).join("")}
          ${c.page ? `<li class="pl-pod-more"><a href="${esc(c.page)}">All ${esc(c.title)} papers →</a></li>` : ""}</ul>` : ""}
      </li>`).join("");
    $("pod-chapters").onclick = (e) => { const b = e.target.closest(".pl-pod-ch"); if (b) jump(+b.dataset.i); };
    drawTicks();
    markChapter();
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Paper Library podcast", album: "Elkon lab" });
    }
  }).catch(() => {
    $("pod-title").textContent = title;
    $("pod-chapters").innerHTML = `<li class="pl-pod-meta">The show notes could not be loaded; the audio still plays.</li>`;
  });
  }
})();
