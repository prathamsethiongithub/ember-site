/* ============================================================
   ember — the island (hero scene, rebuild)
   a floating voxel world: grass, dirt, stone tapering into the void,
   a tree, glowing ember crystals, drifting embers — and him, standing
   at the center, watching your cursor.
   the camera flies through it as you scroll. intro assembly on load.
   three.js r128 UMD · one context · instanced blocks · honest fallback.
   ============================================================ */

(function () {
  "use strict";

  var host = document.querySelector(".hero-scene");
  var fallback = document.querySelector(".hero-fallback");
  var hero = document.querySelector("#hero");
  if (!host || !hero) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = window.matchMedia("(max-width: 900px)").matches;

  /* ---------- deterministic random ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(777002);

  /* ---------- voxel island layout ----------
     grid: R = radius in blocks. grass top with gentle bumps, dirt below,
     stone tapering down to a point. each block: {x,y,z,kind,delay} */
  var R = mobile ? 5 : 7;
  var BLOCKS = [];
  var EXTRA_LIGHTS = [];
  var KINDS = { grass: [], dirt: [], stone: [], trunk: [], leaf: [], emberCrystal: [] };

  function pushBlock(x, y, z, kind, delay) { KINDS[kind].push({ x: x, y: y, z: z, d: delay }); }

  for (var bx = -R; bx <= R; bx++) {
    for (var bz = -R; bz <= R; bz++) {
      var dist = Math.sqrt(bx * bx + bz * bz);
      if (dist > R + 0.4) continue;
      // height: gentle bumps, flatter center (the clearing)
      var bump = dist < 2.5 ? 0 : (rand() < 0.35 ? 1 : 0);
      var delay = 0.06 * dist + rand() * 0.12;      // assembles outward from center
      pushBlock(bx, bump, bz, "grass", delay);
      pushBlock(bx, bump - 1, bz, "dirt", delay + 0.05);
      if (dist < R - 1.2) pushBlock(bx, bump - 2, bz, "dirt", delay + 0.09);
      if (dist < R - 2.6) pushBlock(bx, bump - 3, bz, "stone", delay + 0.13);
      if (dist < R - 3.8) pushBlock(bx, bump - 4, bz, "stone", delay + 0.17);
      if (dist < R - 4.8) pushBlock(bx, bump - 5, bz, "stone", delay + 0.2);
    }
  }

  /* a few ember crystals embedded in the stone — the island's own fire */
  var crystalSpots = [[-4, -3, 2], [5, -3, -3], [2, -4, -4], [-2, -4, 4]];
  crystalSpots.forEach(function (s, i) {
    pushBlock(s[0], s[1], s[2], "emberCrystal", 0.85 + i * 0.04);
  });

  /* a smaller chunk drifting below — instantly sells "floating" */
  (function () {
    var cx = -9, cz = 5, cy = -8;
    for (var sx = -1; sx <= 1; sx++)
      for (var sz = -1; sz <= 1; sz++) {
        if (Math.abs(sx) + Math.abs(sz) > 1.5) continue;
        pushBlock(cx + sx, cy, cz + sz, "grass", 0.9 + rand() * 0.1);
        pushBlock(cx + sx, cy - 1, cz + sz, "dirt", 0.92 + rand() * 0.1);
        if (Math.abs(sx) + Math.abs(sz) < 1.1) pushBlock(cx + sx, cy - 2, cz + sz, "stone", 0.94 + rand() * 0.1);
      }
    pushBlock(cx, cy + 1, cz, "emberCrystal", 1.0);
    var chunkLight = new THREE.PointLight(0xffa04a, 0.8, 10, 2);
    chunkLight.position.set(cx + 1, cy + 3, cz + 1);
    EXTRA_LIGHTS.push(chunkLight);
  })();

  /* the tree — trunk + leaf blob, offset from center so he keeps the stage */
  var TX = -4, TZ = -2;
  for (var ty = 1; ty <= 4; ty++) pushBlock(TX, ty, TZ, "trunk", 0.5 + ty * 0.08);
  for (var lx = -2; lx <= 2; lx++)
    for (var ly = 0; ly <= 2; ly++)
      for (var lz = -2; lz <= 2; lz++) {
        var d = Math.abs(lx) + Math.abs(ly - 1) + Math.abs(lz);
        if (d <= 3 && rand() > 0.18) pushBlock(TX + lx, 4 + ly, TZ + lz, "leaf", 0.7 + rand() * 0.2);
      }

  /* ---------- the character: his REAL skin, the launcher's own mechanic ---------- */
  /* built by skinchar.js — proper per-face UVs + overlay layer. */

  /* ---------- boot ---------- */
  var renderer, scene, camera, groups = {}, meshes = [], embers = null, emberData = [];
  var rafId = null, disposed = false, progress = 0, intro = 0;
  var targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0, pointerActive = false;
  var parallaxX = 0, parallaxY = 0, timeOrigin = performance.now();
  var EMBER_COUNT = mobile ? 32 : 64;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: true });
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping !== undefined) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    if (fallback) fallback.style.display = "none";

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x08070a, 0.026);

    camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.1, 120);
    camera.position.set(0, 6.8, mobile ? 15 : 12.5);

    /* ---- light: warm key with real falloff, cool fill, rim, underglow ---- */
    var key = new THREE.PointLight(0xffb259, 3.2, 30, 2);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.width = key.shadow.mapSize.height = 512;
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    scene.add(key);
    // a small dedicated warm light on him — the poster needs its subject lit
    var him = new THREE.PointLight(0xffc07a, 1.1, 8, 2);
    him.position.set(2.6, 3.2, 2.2);
    scene.add(him);
    var fill = new THREE.DirectionalLight(0x2c3d5c, 0.55);
    fill.position.set(-6, 3, 2);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0x9fc2e8, 0.6);
    rim.position.set(-2, 5, -8);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x2a231c, 0.3));
    EXTRA_LIGHTS.forEach(function (l) { scene.add(l); });

    /* underglow — the island lights the void beneath it */
    (function () {
      var c = document.createElement("canvas"); c.width = c.height = 128;
      var x = c.getContext("2d");
      var g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(255,150,70,0.5)");
      g.addColorStop(0.55, "rgba(190,90,30,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      var pool = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 16),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = -6.4;
      scene.add(pool);
    })();

    /* ---- voxel blocks: one InstancedMesh per material ---- */
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var MATS = {
      grass: new THREE.MeshStandardMaterial({ color: 0x5f9e4a, roughness: 0.85 }),
      dirt: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.85 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.9 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.85 }),
      emberCrystal: new THREE.MeshStandardMaterial({ color: 0x2a1206, emissive: 0xff6a12, emissiveIntensity: 0.5, roughness: 0.4 }),
    };
    var blockGroups = {};
    Object.keys(KINDS).forEach(function (kind) {
      var list = KINDS[kind];
      if (!list.length) return;
      var im = new THREE.InstancedMesh(boxGeo, MATS[kind], list.length);
      im.castShadow = (kind === "grass" || kind === "trunk" || kind === "leaf");
      im.receiveShadow = true;
      im.userData.list = list;
      im.userData.matrix = new THREE.Matrix4();
      scene.add(im);
      blockGroups[kind] = im;
    });

    /* ---- the character: real skin, root offset onto the grass ---- */
    var SC = window.buildSkinCharacter();
    var groups = SC.groups;
    SC.root.position.set(1.9, 1.02, 0);
    SC.root.scale.set(1.6, 1.6, 1.6);
    scene.add(SC.root);

    /* ---- drifting embers (instanced, looping) ---- */
    var emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    emberMat.fog = false;         // fog turned the embers grey
    emberMat.toneMapped = false;   // aces turned the orange pale
    embers = new THREE.InstancedMesh(boxGeo, emberMat, EMBER_COUNT);
    for (var e = 0; e < EMBER_COUNT; e++) {
      emberData.push({
        a: rand() * Math.PI * 2, r: 1.5 + rand() * (R + 1),
        y0: -4 + rand() * 10, speed: 0.35 + rand() * 0.6,
        s: 0.1 + rand() * 0.22, sway: 0.3 + rand() * 0.7,
      });
    }
    scene.add(embers);

    // halo sprites — soft glow blobs riding with the ember cubes (no postprocessing needed)
    var haloTex = (function () {
      var c = document.createElement("canvas"); c.width = c.height = 64;
      var x = c.getContext("2d");
      var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, "rgba(255,170,80,0.55)");
      g.addColorStop(0.45, "rgba(255,120,30,0.22)");
      g.addColorStop(1, "rgba(255,90,10,0)");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    var haloGeo = new THREE.BufferGeometry();
    var haloPos = new Float32Array(EMBER_COUNT * 3);
    haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
    var haloMat = new THREE.PointsMaterial({ map: haloTex, size: 1.1, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    haloMat.fog = false; haloMat.toneMapped = false;
    var halos = new THREE.Points(haloGeo, haloMat);
    scene.add(halos);

    /* ---------- progress: hero scroll flight + intro ---------- */
    function setProgress(p) {
      progress = Math.max(0, Math.min(1, p));
      if (reduce) applyFrame(null, 1);
    }
    if (typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined") {
      ScrollTrigger.create({
        trigger: "#hero", start: "top top", end: "bottom top",
        onUpdate: function (self) { setProgress(self.progress); },
      });
    } else { setProgress(0); }

    /* cursor */
    window.addEventListener("pointermove", function (ev) {
      pointerActive = true;
      var nx = (ev.clientX / window.innerWidth) * 2 - 1;
      var ny = (ev.clientY / window.innerHeight) * 2 - 1;
      targetYaw = nx * (15 * Math.PI / 180);
      targetPitch = ny * (10 * Math.PI / 180);
      parallaxX = nx * 0.45; parallaxY = ny * 0.25;
    });

    /* debug/build hook */
    window.__emberIsland = {
      setProgress: setProgress,
      setIntro: function (t) { intro = t; if (reduce) applyFrame(null, t); },
      freeze: function () { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
      resume: function () { if (rafId === null && !disposed) { timeOrigin = performance.now(); loop(); } },
      debug: function () {
        return {
          progress: progress, intro: intro,
          cam: camera.position.toArray().map(function (v) { return +v.toFixed(2); }),
          yaw: +yaw.toFixed(3),
        };
      },
    };

    /* ---------- frame ---------- */
    var easeOut = function (t) { var u = 1 - t; return 1 - u * u * u; };

    function applyFrame(tSec, introT) {
      var t = tSec === null ? 0 : tSec;
      var it = introT === undefined ? intro : introT;

      /* blocks assemble outward, dropping in with weight */
      Object.keys(blockGroups).forEach(function (kind) {
        var im = blockGroups[kind], list = im.userData.list, mx = im.userData.matrix;
        for (var i = 0; i < list.length; i++) {
          var b = list[i];
          var local = Math.max(0, Math.min(1, (it - b.d) / 0.42));
          var e = easeOut(local);
          var drop = (1 - e) * 5;               // falls from above
          var sc = 0.001 + e * 0.999;
          mx.makeScale(sc, sc, sc);
          mx.setPosition(b.x, b.y + drop, b.z);
          im.setMatrixAt(i, mx);
        }
        im.instanceMatrix.needsUpdate = true;
      });

      /* embers drift up and loop */
      if (embers) {
        var mxe = new THREE.Matrix4();
        for (var k = 0; k < emberData.length; k++) {
          var d = emberData[k];
          var y = d.y0 + ((t * d.speed) % 14);
          if (y > 8) y -= 14;
          var wob = Math.sin(t * d.sway + k) * 0.35;
          var ex = Math.cos(d.a) * d.r + wob, ez = Math.sin(d.a) * d.r + wob * 0.6;
          mxe.makeScale(d.s, d.s, d.s);
          mxe.setPosition(ex, y, ez);
          embers.setMatrixAt(k, mxe);
          haloPos[k * 3] = ex; haloPos[k * 3 + 1] = y; haloPos[k * 3 + 2] = ez;
        }
        embers.instanceMatrix.needsUpdate = true;
        /* solid orange cubes — the halos carry the glow */
        haloGeo.attributes.position.needsUpdate = true;
      }

      /* character: breathing + cursor gaze */
      var breath = 1 + Math.sin((t / 3) * Math.PI * 2) * 0.015;
      groups.torso.scale.y = breath;
      groups.armR.scale.y = groups.armL.scale.y = 1 + (breath - 1) * 0.6;
      if (pointerActive) { yaw += (targetYaw - yaw) * 0.06; pitch += (targetPitch - pitch) * 0.06; }
      groups.head.rotation.y = yaw;
      groups.head.rotation.x = pitch;

      /* camera: scroll flight + mouse parallax
         wide hero → close to him → orbit past the tree → rise away */
      var p = progress, c = camera;
      var x, y2, z, lookY = 1.1;
      if (p < 0.5) {
        var a = easeOut(p / 0.5);
        x = 0.6 * a; y2 = 6.8 - 3.4 * a; z = (mobile ? 15 : 12.5) - (mobile ? 5 : 4.5) * a;
        lookY = -0.4 + 1.4 * a;
      } else {
        var b2 = easeOut((p - 0.5) / 0.5);
        x = 0.6 + 5.2 * b2; y2 = 2.4 + 3.6 * b2; z = (mobile ? 10 : 8) + 4 * b2;
        lookY = 1.1 - 2.0 * b2;
      }
      c.position.set(x + parallaxX, y2 + parallaxY, z);
      c.lookAt(0.6, lookY, 0);

      renderer.render(scene, camera);
    }

    function loop() {
      if (disposed) return;
      var tSec = (performance.now() - timeOrigin) / 1000;
      if (intro < 1) intro = Math.min(1, intro + 0.012); // ~1.4s assembly
      applyFrame(tSec, intro);
      rafId = requestAnimationFrame(loop);
    }

    if (reduce) { applyFrame(null, 1); } else { loop(); }

    /* resize */
    var ro = new ResizeObserver(function () {
      if (disposed) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.fov = host.clientWidth / host.clientHeight < 1 ? 50 : 42;
      camera.updateProjectionMatrix();
      if (reduce) applyFrame(null, 1);
    });
    ro.observe(host);

    /* visibility + disposal */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
      else if (!reduce && rafId === null && !disposed) { timeOrigin = performance.now(); loop(); }
    });
    window.addEventListener("pagehide", function () {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      boxGeo.dispose();
      Object.keys(MATS).forEach(function (k) { MATS[k].dispose(); });
      Object.keys(charMatCache).forEach(function (k) { charMatCache[k].dispose(); });
      if (embers) embers.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    });
  } catch (err) {
    if (host) host.style.display = "none"; // fallback image stays
    window.__islandErr = String(err && err.stack || err);
    console.warn("[island] unavailable (non-fatal):", err);
  }
})();
