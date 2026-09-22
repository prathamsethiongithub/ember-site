/* ============================================================
   ember launch site — S1 · THE SCENE (phase 6: the spectacle)

   a blocky character assembles from 40 drifting ember-cubes as the
   section pins. scroll is the animator: torso first, limbs, head last.
   once formed he stands in warm key light, breathes, and tracks the
   visitor's cursor — the PlayerDirector moment, web edition.

   contract: canvas mounts INSIDE #s1 .materialize-frame. main.js owns
   the pin; this file reads progress over the same range.

   three.js r128 UMD (classic script — file:// must keep working).
   no WebGL => the fallback image (rendered at build time) shows instead.
   reduced motion => one static fully-formed frame, no tracking, no RAF.
   ============================================================ */

(function () {
  "use strict";

  var frame = document.querySelector("#s1 .materialize-frame");
  var host = document.querySelector("#s1 .scene");
  var fallback = document.querySelector("#s1 .scene-fallback");
  var caption = document.querySelector("#s1 .scene-caption");
  if (!frame || !host) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- seeded scatter (deterministic) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(20260922);

  /* ---------- the rig: minecraft proportions, 40 cubes ----------
     units: 1 = one minecraft pixel / 16 (so the figure is 2 units tall).
     part windows (progress): torso 0.10-0.45, limbs 0.30-0.70, head 0.60-0.95 */
  var U = 1 / 16;
  var PALETTE = {
    skin:  0xc9a077,
    hair:  0x3a342e,
    shirt: 0x4f8c8c,
    shirtDark: 0x407575,  // arms read as arms — flush against the torso, so they need their own shade
    pants: 0x596084,
    shoes: 0x4a463f,
    eye:   0x2a2420,
  };
  var CUBES = []; // { px,py,pz (rig px), size, color, window:[t0,t1], group }

  function addCube(px, py, pz, sx, sy, sz, color, win, group) {
    CUBES.push({ px: px, py: py, pz: pz, sx: sx, sy: sy, sz: sz, color: color, win: win, group: group });
  }

  /* torso 8x12x4 → 2x3x2 chunks of 4x4x2 (12 cubes) — forms first */
  for (var tx = 0; tx < 2; tx++)
    for (var ty = 0; ty < 3; ty++)
      for (var tz = 0; tz < 2; tz++)
        addCube(-4 + tx * 4 + 2, 12 + ty * 4 + 2, -2 + tz * 2 + 1,
                4, 4, 2, PALETTE.shirt, [0.10, 0.45], "torso");

  /* arms 4x12x4 → 3 chunks each (6 cubes) — a QUARTER pixel out (reads attached,
     still separable), in their own shade (flush limbs vanish at this light) */
  [-6.25, 6.25].forEach(function (ax) {
    for (var ay = 0; ay < 3; ay++)
      addCube(ax, 12 + ay * 4 + 2, 0, 4, 4, 4, PALETTE.shirtDark, [0.30, 0.70], "arm");
  });

  /* legs 4x12x4 → 3 chunks each (6 cubes) — same quarter-pixel separation */
  [-2.25, 2.25].forEach(function (lx) {
    for (var ly = 0; ly < 3; ly++)
      addCube(lx, ly * 4 + 2, 0, 4, 4, 4, ly === 0 ? PALETTE.shoes : PALETTE.pants, [0.30, 0.70], "leg");
  });

  /* head 8x8x8 → 2x2x2 (8 cubes) — forms LAST */
  for (var hx = 0; hx < 2; hx++)
    for (var hy = 0; hy < 2; hy++)
      for (var hz = 0; hz < 2; hz++)
        addCube(-4 + hx * 4 + 2, 24 + hy * 4 + 2, -4 + hz * 4 + 2,
                4, 4, 4, PALETTE.skin, [0.60, 0.95], "head");

  /* hat layer → 6 cubes: back/top/sides only. the FRONT stays open so the
     face shows (a full shell reads as a featureless box). */
  for (var wx = 0; wx < 2; wx++)
    for (var wy = 0; wy < 2; wy++)
      for (var wz = 0; wz < 2; wz++) {
        if (wz === 1 && wy === 0) continue; // open the face — no front hat at head level
        addCube(-4.2 + wx * 4.2 + 2.1, 23.8 + wy * 4.2 + 2.1, -4.2 + wz * 4.2 + 2.1,
                4.2, 4.2, 4.6, PALETTE.hair, [0.60, 0.95], "head");
      }

  /* two eyes — the instant "it's a character" read (42 cubes total).
     proud of the face by 0.6px, below the hat brim line (y<28). */
  [-2, 2].forEach(function (ex) {
    addCube(ex, 26, 4.6, 2.5, 2.5, 1.6, PALETTE.eye, [0.72, 0.98], "head");
  });

  /* ---------- boot ---------- */

  var renderer, scene, camera, groups = {}, cubes = [], rafId = null, disposed = false;
  var progress = 0, targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
  var pointerActive = false, timeOrigin = performance.now();

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: "low-power",
      preserveDrawingBuffer: true, // build tooling captures frames — deterministic screenshots
    });
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic roll-off — keeps side-light from washing out
      renderer.toneMappingExposure = 1.15;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(frame.clientWidth, frame.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    if (fallback) fallback.style.display = "none"; // webgl is live — image retires

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, frame.clientWidth / frame.clientHeight, 0.1, 100);
    camera.position.set(0, 1.62, 8.6);

    /* ---- lighting: this is 80% of the expensive look ----
       the KEY is a point light, not directional: flat faces under a
       directional light read as flat colour — a point light falls off
       with distance, so the head is lit and the feet fall into shadow.
       that vertical gradient IS the drama. */
    var key = new THREE.PointLight(0xffb259, 3.8, 10, 2); // distance 10 = real falloff (r128: distance 0 disables attenuation entirely)
    key.position.set(2.6, 4.4, 3.2);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x2c3d4f, 0.25);     // cool dim fill — low, so the key stays WARM
    fill.position.set(-3.5, 1.0, 2.0);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xbfd4e8, 0.5);       // subtle rim from behind
    rim.position.set(-1.5, 3.0, -4.0);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x241d17, 0.25));         // floor of light, not flatness

    /* ---- the ground pool: a soft warm disc under him — grounds the figure
       and reads as the hero spotlight. additive, so it can only warm, never box. */
    (function () {
      var pc = document.createElement("canvas");
      pc.width = pc.height = 128;
      var px = pc.getContext("2d");
      var g = px.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(255,170,90,0.55)");
      g.addColorStop(0.5, "rgba(200,120,50,0.18)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      px.fillStyle = g;
      px.fillRect(0, 0, 128, 128);
      var tex = new THREE.CanvasTexture(pc);
      var pool = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.3),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.01;
      scene.add(pool);
    })();

    /* ---- groups: head pivots at the neck for tracking ---- */
    ["torso", "arm", "leg", "head"].forEach(function (k) { groups[k] = new THREE.Group(); scene.add(groups[k]); });

    var geo = new THREE.BoxGeometry(1, 1, 1);
    var matCache = {};
    CUBES.forEach(function (c) {
      if (!matCache[c.color]) {
        matCache[c.color] = new THREE.MeshStandardMaterial({
          color: c.color, roughness: 0.72, metalness: 0.05,
          emissive: 0xff7a22, emissiveIntensity: 1.0, // saturated ember — amber at full intensity washes to cream
        });
      }
      var mesh = new THREE.Mesh(geo, matCache[c.color].clone()); // own material: per-cube emissive fade
      mesh.scale.set(c.sx * U, c.sy * U, c.sz * U);
      mesh.userData.baseColor = new THREE.Color(c.color); // albedo to restore as the cube locks
      mesh.userData.darkColor = new THREE.Color(0x241206); // near-black ember core while in flight
      // rig position — RELATIVE to the part group (head group sits at the neck)
      mesh.userData.rig = new THREE.Vector3(c.px * U, c.py * U, c.pz * U);
      if (c.group === "head") mesh.userData.rig.y -= 24 * U;
      mesh.userData.win = c.win;
      // deterministic scatter: drifting ember-cubes in the void (group space)
      var a = rand() * Math.PI * 2, r = 5.5 + rand() * 3.5;
      mesh.userData.scatter = new THREE.Vector3(
        Math.cos(a) * r,
        0.4 + rand() * 3.2,
        Math.sin(a) * r * 0.7 - 1.2
      );
      if (c.group === "head") mesh.userData.scatter.y -= 24 * U;
      mesh.userData.scatterRot = new THREE.Euler(rand() * 3.1, rand() * 3.1, rand() * 3.1);
      mesh.position.copy(mesh.userData.scatter);
      mesh.rotation.copy(mesh.userData.scatterRot);
      groups[c.group].add(mesh);
      cubes.push(mesh);
    });

    /* head group pivots at the neck (y = 24px) — head/hat rigs are neck-relative */
    groups.head.position.set(0, 24 * U, 0);

    /* ---------- progress: same range as the pin ---------- */

    function setProgress(p) {
      progress = Math.max(0, Math.min(1, p));
      if (caption) caption.style.setProperty("--p", progress.toFixed(4));
      // apply immediately: correct even if the RAF is frozen (build renders,
      // reduced-motion) and keeps scroll-driven state exact between frames.
      applyFrame(reduce ? null : (performance.now() - timeOrigin) / 1000);
    }

    if (typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined") {
      ScrollTrigger.create({
        trigger: "#s1", start: "top top", end: "+=85%",
        onUpdate: function (self) { setProgress(self.progress); },
      });
    } else {
      setProgress(1);
    }

    /* debug/build hook: lets the build render the fallback frame */
    window.__emberScene = {
      setProgress: function (p) { setProgress(p); },
      freeze: function () { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
      resume: function () { if (rafId === null && !disposed) { timeOrigin = performance.now(); loop(); } },
      debug: function () {
        return cubes.map(function (m) {
          var v = new THREE.Vector3();
          m.getWorldPosition(v);
          return { w: m.userData.win[0], x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) };
        });
      },
    };

    /* ---------- per-frame ---------- */

    var easeOut = function (t) { var u = 1 - t; return 1 - u * u * u; }; // arrive with weight

    function applyFrame(tSec) {
      for (var i = 0; i < cubes.length; i++) {
        var m = cubes[i], u = m.userData;
        var local = (progress - u.win[0]) / (u.win[1] - u.win[0]);
        local = Math.max(0, Math.min(1, local));
        var e = easeOut(local);
        m.position.lerpVectors(u.scatter, u.rig, e);
        m.rotation.x = u.scatterRot.x * (1 - e);
        m.rotation.y = u.scatterRot.y * (1 - e);
        m.rotation.z = u.scatterRot.z * (1 - e);
        // he's made of fire settling into flesh: while in flight the albedo is
        // near-black so ONLY the emission carries (aces desaturates saturated
        // emissives — dark albedo is what makes an ember read as an ember).
        var heat = 1 - local * local;
        m.material.emissiveIntensity = 0.85 * heat; // below the aces knee — above it, orange compresses to pale peach
        m.material.color.copy(u.baseColor).lerp(u.darkColor, heat);
      }

      // breathing (torso + arms ride it) — alive, 3s cycle, ±1.5%
      if (tSec !== null) {
        var breath = 1 + Math.sin((tSec / 3) * Math.PI * 2) * 0.015;
        groups.torso.scale.y = breath;
        groups.arm.scale.y = 1 + (breath - 1) * 0.6;
      }

      // head tracking — damped, ±15° yaw / ±10° pitch
      if (tSec !== null && pointerActive && progress > 0.95) {
        yaw += (targetYaw - yaw) * 0.06;
        pitch += (targetPitch - pitch) * 0.06;
      } else if (tSec !== null) {
        yaw += (0 - yaw) * 0.05;
        pitch += (0 - pitch) * 0.05;
      }
      groups.head.rotation.y = yaw;
      groups.head.rotation.x = pitch;

      // camera: slow dolly-in synced to scroll
      var ce = easeOut(progress);
      camera.position.z = 8.6 - 4.9 * ce;
      camera.position.y = 1.62 - 0.32 * ce;
      camera.lookAt(0, 1.18, 0);

      renderer.render(scene, camera);
    }

    function loop() {
      if (disposed) return;
      applyFrame((performance.now() - timeOrigin) / 1000);
      rafId = requestAnimationFrame(loop);
    }

    /* cursor tracking */
    window.addEventListener("pointermove", function (e) {
      pointerActive = true;
      var nx = (e.clientX / window.innerWidth) * 2 - 1;
      var ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetYaw = nx * (15 * Math.PI / 180);
      targetPitch = ny * (10 * Math.PI / 180);
    });
    window.addEventListener("pointerleave", function () { pointerActive = false; });

    if (reduce) {
      applyFrame(null); // one static, fully-formed frame — no tracking, no RAF
    } else {
      loop();
    }

    /* resize */
    var ro = new ResizeObserver(function () {
      if (disposed) return;
      var w = frame.clientWidth, h = frame.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // portrait framing: widen fov so the full figure fits
      camera.fov = w / h < 1 ? 46 : 38;
      camera.updateProjectionMatrix();
      if (reduce) applyFrame(null);
    });
    ro.observe(frame);

    /* disposal — every GL resource accounted */
    window.addEventListener("pagehide", function () {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      geo.dispose();
      Object.keys(matCache).forEach(function (k) { matCache[k].dispose(); });
      cubes.forEach(function (m) { m.material.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    });
  } catch (err) {
    /* no WebGL — the fallback image (rendered at build time) stays visible. */
    if (host) host.style.display = "none";
    console.warn("[scene] unavailable (non-fatal):", err);
  }
})();
