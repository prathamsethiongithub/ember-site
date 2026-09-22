/* ============================================================
   ember — the character demo (S2)
   the same rig, standing in his own small dark room.
   he tracks your cursor from here too. move the mouse.
   ============================================================ */

(function () {
  "use strict";

  var host = document.querySelector(".character-scene");
  var fallback = document.querySelector(".character-fallback");
  if (!host) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* his real skin — built by skinchar.js (the launcher's own mechanic) */

  var renderer, scene, camera, groups = {}, rafId = null, disposed = false;
  var targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0, timeOrigin = performance.now();

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: true });
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping !== undefined) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    if (fallback) fallback.style.display = "none";

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, host.clientWidth / host.clientHeight, 0.1, 60);
    camera.position.set(0, 1.35, 5.4);
    camera.lookAt(0, 1.05, 0);

    var key = new THREE.PointLight(0xffb259, 3.4, 14, 2);
    key.position.set(2.2, 3.6, 2.6);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x2c3d5c, 0.5);
    fill.position.set(-3, 1.4, 2);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xbfd4e8, 0.7);
    rim.position.set(-1.4, 2.8, -3.4);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x241d17, 0.4));

    var SC = window.buildSkinCharacter();
    var groups = SC.groups;
    SC.root.position.set(0, 0, 0);
    scene.add(SC.root);

    window.addEventListener("pointermove", function (ev) {
      var r = host.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var nx = Math.max(-1, Math.min(1, (ev.clientX - cx) / (window.innerWidth * 0.5)));
      var ny = Math.max(-1, Math.min(1, (ev.clientY - cy) / (window.innerHeight * 0.5)));
      targetYaw = nx * (15 * Math.PI / 180);
      targetPitch = ny * (10 * Math.PI / 180);
    });

    window.__emberCharacter = {
      freeze: function () { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
      resume: function () { if (rafId === null && !disposed) { timeOrigin = performance.now(); loop(); } },
      debug: function () { return { yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3) }; },
    };

    function frame(t) {
      var breath = 1 + Math.sin((t / 3) * Math.PI * 2) * 0.015;
      groups.torso.scale.y = breath;
      groups.armR.scale.y = groups.armL.scale.y = 1 + (breath - 1) * 0.6;
      yaw += (targetYaw - yaw) * 0.06;
      pitch += (targetPitch - pitch) * 0.06;
      groups.head.rotation.y = yaw;
      groups.head.rotation.x = pitch;
      renderer.render(scene, camera);
    }
    function loop() {
      if (disposed) return;
      frame((performance.now() - timeOrigin) / 1000);
      rafId = requestAnimationFrame(loop);
    }
    if (reduce) frame(0); else loop();

    var ro = new ResizeObserver(function () {
      if (disposed) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      if (reduce) frame(0);
    });
    ro.observe(host);

    window.addEventListener("pagehide", function () {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      geo.dispose();
      Object.keys(matCache).forEach(function (k) { matCache[k].dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
    });
  } catch (err) {
    if (host) host.style.display = "none";
    window.__charErr = String(err && err.stack || err);
    console.warn("[character] unavailable (non-fatal):", err);
  }
})();
