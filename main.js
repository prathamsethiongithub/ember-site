/* ============================================================
   ember launch site — scroll narrative skeleton (phase 1/5)
   GSAP + ScrollTrigger, vendored locally (no CDN dependency).

   motion grammar (inherited from the EMBER system):
     · scrub only — the scroll IS the timeline
     · no bounce, no elastic, no stagger-for-show
     · reduced motion => this file does nothing, layout stays intact
     · no-JS safe: hidden states only apply under html.js, and .js is
       only added when GSAP is actually present and motion is allowed
   ============================================================ */

(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof window.gsap !== "undefined" &&
                typeof window.ScrollTrigger !== "undefined";

  // content is never hidden unless animation will actually run
  if (reduce || !hasGsap) return;
  document.documentElement.classList.add("js");

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: "none" });

  /* ---------- S0 · hero — stillness, then it lets go ---------- */
  gsap.timeline({
    scrollTrigger: { trigger: "#s0", start: "top top", end: "bottom top", scrub: true }
  })
    .to(".hero-word", { yPercent: -7, opacity: 0.2 }, 0)
    .to(".hero-sub", { opacity: 0 }, 0)
    .to(".hero-cta", { opacity: 0 }, 0)
    .to(".hero-hint", { opacity: 0 }, 0);

  /* ---------- S1 · the materialize — pinned anticipation ----------
     the pin structure is the contract: the coal ignition (materialize.js)
     reads its progress from this exact range. desktop pins; mobile lets
     the section scroll through (progress still maps over the same span). */
  var mm = gsap.matchMedia();

  mm.add("(min-width: 768px)", function () {
    ScrollTrigger.create({
      trigger: "#s1",
      start: "top top",
      end: "+=85%",
      pin: true,
      scrub: true
    });
  });

  /* ---------- S2 · the launcher — procession ----------
     one entrance family for all four beats (number -> title -> line, small
     internal stagger), and the oracle's evidence settles in LAST — the
     heaviest element of the procession, because it's output, not design. */
  gsap.utils.toArray(".beat").forEach(function (beat) {
    var num = beat.querySelector(".beat-num");
    var title = beat.querySelector(".beat-title");
    var line = beat.querySelector(".beat-line");
    var tl = gsap.timeline({
      scrollTrigger: { trigger: beat, start: "top 88%", end: "top 55%", scrub: true }
    });
    if (num) tl.fromTo(num, { y: 18, opacity: 0 }, { y: 0, opacity: 1 }, 0);
    if (title) tl.fromTo(title, { y: 24, opacity: 0 }, { y: 0, opacity: 1 }, 0.08);
    if (line) tl.fromTo(line, { y: 28, opacity: 0 }, { y: 0, opacity: 1 }, 0.16);
  });

  /* the evidence block: ONE settle-in, slightly after its beat. no flourish. */
  gsap.utils.toArray(".oracle-evidence").forEach(function (el) {
    gsap.fromTo(el, { y: 14, opacity: 0 }, {
      y: 0, opacity: 1,
      scrollTrigger: { trigger: el, start: "top 92%", end: "top 64%", scrub: true }
    });
  });

  /* ---------- S5 · the signature — each line settles on its own beat,
     the third lands hardest (more travel, a longer settle window). ---------- */
  var sigSpec = [
    { y: 22, start: "top 90%", end: "top 62%" },
    { y: 30, start: "top 80%", end: "top 54%" },
    { y: 40, start: "top 68%", end: "top 42%" },
  ];
  gsap.utils.toArray(".sig-line").forEach(function (el, i) {
    var s = sigSpec[Math.min(i, sigSpec.length - 1)];
    gsap.fromTo(el, { y: s.y, opacity: 0 }, {
      y: 0, opacity: 1,
      scrollTrigger: { trigger: el, start: s.start, end: s.end, scrub: true }
    });
  });

  /* ---------- S2 · parallax depth (modest, subordinate) ----------
     the number/eyebrow layer drifts at ~0.9x while the content holds 1x.
     barely perceptible — depth, not decoration. */
  gsap.to(".launcher .eyebrow, .launcher .beat-num", {
    y: -18,
    scrollTrigger: { trigger: "#s2", start: "top bottom", end: "bottom top", scrub: true }
  });

  /* ---------- S3–S6 · quiet reveals ----------
     one reveal primitive for the rest of the descent. */
  gsap.utils.toArray(".reveal").forEach(function (el) {
    gsap.fromTo(el,
      { y: 24, opacity: 0 },
      {
        y: 0, opacity: 1,
        scrollTrigger: { trigger: el, start: "top 90%", end: "top 62%", scrub: true }
      });
  });

  /* refresh after fonts settle — metrics shift when webfonts land */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
