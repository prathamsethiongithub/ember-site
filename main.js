/* ============================================================
   ember — page motion (rebuild)
   scroll reveals, hero copy handoff. no bounce, one easing.
   reduced motion => everything static. no JS => everything visible.
   ============================================================ */

(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* the intro veil: plays the splash, lifts on end / click / 3.2s, once */
  (function () {
    var veil = document.getElementById("introVeil");
    var vid = document.getElementById("introVid");
    if (!veil) return;
    if (reduce || sessionStorage.getItem("ember-intro-seen")) { veil.parentNode.removeChild(veil); return; }
    var gone = false;
    function lift() {
      if (gone) return; gone = true;
      sessionStorage.setItem("ember-intro-seen", "1");
      veil.classList.add("gone");
      setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 800);
    }
    try { vid && vid.play(); } catch (e) {}
    vid && vid.addEventListener("ended", lift);
    setTimeout(lift, 3400);
    veil.addEventListener("click", lift);
    window.addEventListener("wheel", lift, { passive: true, once: true });
    window.addEventListener("keydown", lift, { once: true });
  })();

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
