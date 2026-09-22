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

  var U = 1 / 16;
  var PALETTE = {
    skin: 0xc9a077, hair: 0x3a342e, shirt: 0x4f8c8c, shirtDark: 0x407575,
    pants: 0x596084, shoes: 0x4a463f, eye: 0x2a2420,
  };
  var CUBES = [];
  function addCube(px, py, pz, sx, sy, sz, color, group) {
    CUBES.push({ px: px, py: py, pz: pz, sx: sx, sy: sy, sz: sz, color: color, group: group });
  }
  for (var tx = 0; tx < 2; tx++) for (var ty = 0; ty < 3; ty++) for (var tz = 0; tz < 2; tz++)
    addCube(-4 + tx * 4 + 2, 12 + ty * 4 + 2, -2 + tz * 2 + 1, 4, 4, 2, PALETTE.shirt, "torso");
  [-6.25, 6.25].forEach(function (ax) { for (var ay = 0; ay < 3; ay++) addCube(ax, 12 + ay * 4 + 2, 0, 4, 4, 4, PALETTE.shirtDark, "arm"); });
  [-2.25, 2.25].forEach(function (lx) { for (var ly = 0; ly < 3; ly++) addCube(lx, ly * 4 + 2, 0, 4, 4, 4, ly === 0 ? PALETTE.shoes : PALETTE.pants, "leg"); });
  for (var hx = 0; hx < 2; hx++) for (var hy = 0; hy < 2; hy++) for (var hz = 0; hz < 2; hz++)
    addCube(-4 + hx * 4 + 2, 24 + hy * 4 + 2, -4 + hz * 4 + 2, 4, 4, 4, PALETTE.skin, "head");
  for (var wx = 0; wx < 2; wx++) for (var wy = 0; wy < 2; wy++) for (var wz = 0; wz < 2; wz++) {
    if (wz === 1 && wy === 0) continue;
    addCube(-4.2 + wx * 4.2 + 2.1, 23.8 + wy * 4.2 + 2.1, -4.2 + wz * 4.2 + 2.1, 4.2, 4.2, 4.6, PALETTE.hair, "head");
  }
  [-2, 2].forEach(function (ex) { addCube(ex, 26, 4.6, 2.5, 2.5, 1.6, PALETTE.eye, "head"); });

  var renderer, scene, camera, groups = {}, meshes = [], rafId = null, disposed = false;
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

    ["torso", "arm", "leg", "head"].forEach(function (k) { groups[k] = new THREE.Group(); scene.add(groups[k]); });
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var matCache = {};
    CUBES.forEach(function (c) {
      if (!matCache[c.color]) matCache[c.color] = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.72, metalness: 0.05 });
      var m = new THREE.Mesh(geo, matCache[c.color].clone());
      m.scale.set(c.sx * U, c.sy * U, c.sz * U);
      m.position.set(c.px * U, c.py * U, c.pz * U);
      if (c.group === "head") m.position.y -= 24 * U;
      groups[c.group].add(m);
      meshes.push(m);
    });
    groups.head.position.set(0, 24 * U, 0);

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
      groups.arm.scale.y = 1 + (breath - 1) * 0.6;
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
      meshes.forEach(function (m) { m.material.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
    });
  } catch (err) {
    if (host) host.style.display = "none";
    console.warn("[character] unavailable (non-fatal):", err);
  }
})();
