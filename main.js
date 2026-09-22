/* ============================================================
   ember — page motion (rebuild)
   scroll reveals, hero copy handoff. no bounce, one easing.
   reduced motion => everything static. no JS => everything visible.
   ============================================================ */

(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  if (reduce || !hasGsap) return;

  document.documentElement.classList.add("js");
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: "none" });

  /* hero copy lifts away as the camera flies */
  gsap.timeline({
    scrollTrigger: { trigger: "#hero", start: "top top", end: "60% top", scrub: true },
  })
    .to(".hero-copy", { yPercent: -14, opacity: 0 }, 0)
    .to(".topbar", { opacity: 0.15 }, 0)
    .to(".hero-hint", { opacity: 0 }, 0);

  /* every section rises in */
  gsap.utils.toArray(".section .eyebrow, .section .h2, .section .lede, .section .terminal, .section .character-stage, .section .shot-main, .section .shot-row, .section .cards, .section .stats, .section .smp-card, .footer-in, .footer-credit").forEach(function (el) {
    gsap.fromTo(el,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, scrollTrigger: { trigger: el, start: "top 88%", end: "top 58%", scrub: true } });
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
