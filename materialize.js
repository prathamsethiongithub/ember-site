/* ============================================================
   ember launch site — S1 · coal ignition (phase 2 rework)

   a coal doesn't assemble from particles. it GLOWS, and the glow
   intensifies as you approach, then it's there — warm, alive,
   breathing. the word is HTML type; scroll drives its ignition:
   blurred amber heat -> frosted suggestion -> crisp warm light.
   embers (6-10) drift UP from the word and fade — they leave the
   fire, they don't form it.

   no WebGL. no three.js. pure DOM/CSS + one scroll-driven scalar.
   reduced motion => no embers, static resolved word (CSS handles it).
   no JS => the word renders resolved (--p defaults to 1 in CSS).
   ============================================================ */

(function () {
  "use strict";

  var ignition = document.querySelector("#s1 .ignition");
  if (!ignition) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ignition progress: 0 -> 1 across the pin range ---------- */

  var p = 0;
  function setP(v) {
    p = Math.max(0, Math.min(1, v));
    ignition.style.setProperty("--p", p.toFixed(4));
  }

  var hasScrollSystem =
    typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  if (hasScrollSystem) {
    ScrollTrigger.create({
      trigger: "#s1",
      start: "top top",
      end: "+=85%",
      onUpdate: function (self) { setP(self.progress); },
    });
  } else {
    setP(1); // no scroll system — show the coal at rest
  }

  /* ---------- rising embers ---------- */

  if (reduce) return; // static resolved word — no embers

  var word = ignition.querySelector(".ignition-crisp");
  var sparks = 0;
  var MAX_LIVE = 10;

  function spawnSpark() {
    if (sparks >= MAX_LIVE || !word) return;
    var r = word.getBoundingClientRect();
    if (r.width === 0) return;

    var ir = ignition.getBoundingClientRect();
    var el = document.createElement("i");
    el.className = "spark";
    // spawn along the word's body (avoid the extreme edges — embers leave the coals)
    var x = r.left - ir.left + r.width * (0.08 + Math.random() * 0.84);
    var y = r.top - ir.top + r.height * (0.35 + Math.random() * 0.55);
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", ((Math.random() - 0.5) * 36).toFixed(1) + "px");
    el.style.setProperty("--dur", (2.4 + Math.random() * 1.6).toFixed(2) + "s");
    el.style.width = el.style.height = (2 + Math.random() * 2).toFixed(1) + "px";

    sparks++;
    el.addEventListener("animationend", function () {
      sparks--;
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    ignition.appendChild(el);
  }

  /* spawn rate: more activity mid-formation, settling at rest.
     activity = sin(pi * p) — peaks at the middle of the ignition.
     the loop only runs while S1 is on screen (perf receipt: no rAF burn
     off-screen, none in a hidden tab). */
  var acc = 0, last = performance.now(), rafId = null;

  function loop(now) {
    var dt = now - last;
    last = now;
    if (p > 0.12) {
      var activity = Math.sin(Math.PI * p);           // 0..1..0
      var interval = 1300 - 950 * activity;           // 1300ms at rest -> 350ms mid
      acc += dt;
      if (acc >= interval) { acc = 0; spawnSpark(); }
    } else {
      acc = 0;
    }
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId === null) { last = performance.now(); rafId = requestAnimationFrame(loop); }
  }
  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) startLoop(); else stopLoop();
    }).observe(ignition);
  } else {
    startLoop();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopLoop(); else startLoop();
  });
})();
