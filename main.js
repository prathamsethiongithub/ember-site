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

  /* every section rises in — scrubbed to its own scroll progress */
  gsap.utils.toArray(".section .eyebrow, .section .h2, .section .lede, .section .terminal, .section .character-stage, .section .shot-main, .section .shot-row, .section .cards, .section .stats, .section .smp-card").forEach(function (el) {
    gsap.fromTo(el,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, scrollTrigger: { trigger: el, start: "top 88%", end: "top 58%", scrub: true } });
  });

  /* the page-bottom elements (footer) can NEVER reach the scrubbed end
     threshold — their top only rises to ~78% of the viewport at max scroll,
     so a scrub leaves them frozen at partial opacity. these PLAY ONCE. */
  gsap.utils.toArray(".footer-in, .footer-credit").forEach(function (el) {
    gsap.fromTo(el,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 98%", once: true } });
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
