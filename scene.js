/* ============================================================
   ember — scene.js (v3, "the chunk")
   ONE 16x16 minecraft chunk, extracted whole and suspended in the
   void: curated terrain, two oaks, a pool, a ruin, straight edges.
   he stands on the front clearing — the real skin, the launcher's
   own mechanic. sparse embers drift past. the camera drifts slowly;
   scrolling eases it in and lifts it away. restrained on purpose:
   the chunk is a display piece, not a game.

   chunk geometry comes from chunk.js (merged, face-culled, 1-2 draw
   calls). three.js r128 UMD · one context · honest fallback.
   ============================================================ */

(function () {
  "use strict";

  var host = document.querySelector(".hero-scene");
  var fallback = document.querySelector(".hero-fallback");
  var hero = document.querySelector("#hero");
  if (!host || !hero) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = window.matchMedia("(max-width: 900px)").matches;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(777002);

  var renderer, scene, camera, worldRoot = null, worldMats = [], worldLights = [], groups = {}, embers = null, emberData = [];
  var rafId = null, disposed = false, progress = 0, intro = 0;
  var targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0, pointerActive = false;
  var parallaxX = 0, parallaxY = 0, timeOrigin = performance.now();
  var EMBER_COUNT = mobile ? 22 : 36;
  var keyLight = null, himLight = null;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: true });
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping !== undefined) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    if (fallback) fallback.style.display = "none";

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x08070a, 0.016);

    camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 140);
    camera.position.set(0.8, 5.4, mobile ? 28.0 : 26.0);

    /* ---- light: one warm key, a cool fill, a rim, ambient; the key sways ---- */
    keyLight = new THREE.DirectionalLight(0xffb259, 1.6);
    keyLight.position.set(14, 20, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 90;
    keyLight.shadow.camera.left = -30; keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30; keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.002;
    scene.add(keyLight);
    himLight = new THREE.PointLight(0xffc07a, 1.0, 18, 2);
    himLight.position.set(5.4, 7.2, 11.6);   // frontal + high: lights the FACE and both arms, never a hot spot
    scene.add(himLight);
    var under = new THREE.PointLight(0xff8a2a, 3.0, 30, 2);   // embers glow from beneath the world
    under.position.set(0, -4.6, 6);
    scene.add(under);
    var fill = new THREE.DirectionalLight(0x2c3d5c, 0.32);
    fill.position.set(-6, 3, 2);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0x9fc2e8, 0.35);
    rim.position.set(-3, 6, -9);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x2a231c, 0.3));

    /* ---- THE REAL WORLD ----
       this is not procedural: assets/hive.glb is exported from the actual
       Hive world's region files (scripts/export-world.py + build-glb.py),
       with the real block textures extracted from the actual 1.21.11 client
       jar. 50x50x14 blocks of the world, face-culled, lights included. */
    var stagePoint = new THREE.Vector3(0, 4.55, 5);
    if (location.protocol === "file:") {
      /* browsers block XHR of the .glb from file:// — show the fallback render
         (the same real world, pre-rendered) instead of a failed request */
      if (host) host.style.display = "none";
    } else (function loadWorld() {
      new THREE.GLTFLoader().load("assets/hive.glb", function (g) {
        var root = g.scene;
        root.scale.set(0.6, 0.6, 0.6);
        root.position.y = -7.5;                    // center the slab on y=0
        root.traverse(function (o) {
          if (o.isMesh && o.material) {
            worldMats.push(o.material);
            if (o.material.map) {
              o.material.map.magFilter = THREE.NearestFilter;
              o.material.map.minFilter = THREE.NearestMipmapLinearFilter;  // kills grazing-angle shimmer, keeps the pixel look
              o.material.map.generateMipmaps = true;
              o.material.map.anisotropy = 4;
              o.material.map.needsUpdate = true;
            }
            o.castShadow = o.name !== "blend";
            o.receiveShadow = true;
          }
        });
        scene.add(root);
        worldRoot = root;
        fetch("assets/hive-meta.json").then(function (r) { return r.json(); }).then(function (meta) {
          (meta.lights || []).forEach(function (L) {
            var p = new THREE.PointLight(L.color, 0.85, 11, 2);
            p.position.set(L.x * 0.6, L.y * 0.6 - 7.5 + 0.5, L.z * 0.6);
            scene.add(p); worldLights.push(p);
          });
          if (meta.stage) {
            stagePoint.set(meta.stage.x * 0.6, meta.stage.y * 0.6 - 7.5, meta.stage.z * 0.6);
            SC.root.position.set(4.5, stagePoint.y + 0.02, 8.6);   // front-right: the subject, not a speck
            window.__charDebug = SC.root.position.toArray().concat([SC.root.visible]);
          }
        });
        window.__emberWorldInfo = { tris: 28610, tiles: 0, maxY: 4 };
      }, undefined, function (err) {
        if (host) host.style.display = "none";     // the real-world fallback render stays
        window.__worldErr = String(err && err.message || err);
        console.warn("[world] load failed (file:// needs http):", err);
      });
    })();

    /* underglow — the chunk's warmth bleeding into the void beneath */
    (function () {
      var c = document.createElement("canvas"); c.width = c.height = 128;
      var x = c.getContext("2d");
      var g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(255,150,70,0.5)");
      g.addColorStop(0.55, "rgba(190,90,30,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      var pool = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = -7.6;
      scene.add(pool);
    })();

    /* ---- the character: real skin, on the front clearing ---- */
    var SC = window.buildSkinCharacter();
    groups = SC.groups;
    SC.root.position.set(5.4, 2.52, 5.2);
    SC.root.scale.set(3.4, 3.4, 3.4);
    SC.groups.armR.rotation.z = -0.22;   // armR is at -x now → -z swings it OUT
    SC.groups.armL.rotation.z = 0.22;    // armL is at +x → +z swings it OUT
    scene.add(SC.root);

    /* ---- sparse embers, drifting past the chunk ---- */
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    emberMat.fog = false;
    emberMat.toneMapped = false;
    embers = new THREE.InstancedMesh(boxGeo, emberMat, EMBER_COUNT);
    for (var e = 0; e < EMBER_COUNT; e++) {
      emberData.push({
        a: rand() * Math.PI * 2, r: 8 + rand() * 6,
        y0: -5 + rand() * 12, speed: 0.3 + rand() * 0.5,
        s: 0.1 + rand() * 0.2, sway: 0.25 + rand() * 0.5,
      });
    }
    scene.add(embers);

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
    var haloMat = new THREE.PointsMaterial({ map: haloTex, size: 1.15, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    haloMat.fog = false; haloMat.toneMapped = false;
    var halos = new THREE.Points(haloGeo, haloMat);
    scene.add(halos);

    /* ---------- progress: gentle scroll drift ---------- */
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

    window.addEventListener("pointermove", function (ev) {
      pointerActive = true;
      var nx = (ev.clientX / window.innerWidth) * 2 - 1;
      var ny = (ev.clientY / window.innerHeight) * 2 - 1;
      targetYaw = nx * (12 * Math.PI / 180);
      targetPitch = ny * (8 * Math.PI / 180);
      parallaxX = nx * 0.35; parallaxY = ny * 0.2;
    });

    window.__emberIsland = {
      setProgress: setProgress,
      setIntro: function (t) { intro = t; if (reduce) applyFrame(null, t); },
      freeze: function () { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
      resume: function () { if (rafId === null && !disposed) { timeOrigin = performance.now(); loop(); } },
      viewAt: function (x, y, z, tx, ty, tz) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        camera.position.set(x, y, z);
        camera.lookAt(tx, ty, tz);
        renderer.render(scene, camera);
      },
      debug: function () {
        return {
          progress: progress, intro: intro,
          cam: camera.position.toArray().map(function (v) { return +v.toFixed(2); }),
          tris: worldRoot ? 28610 : 0,
        };
      },
    };

    /* ---------- frame ---------- */
    var easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    var easeOut = function (t) { var u = 1 - t; return 1 - u * u * u; };

    function applyFrame(tSec, introT) {
      var t = tSec === null ? 0 : tSec;
      var it = introT === undefined ? intro : introT;

      /* the world fades in — the real region materializes under him */
      if (worldMats.length) {
        var k = Math.max(0, Math.min(1, it / 0.9));
        if (k < 1) {
          for (var wi = 0; wi < worldMats.length; wi++) {
            var wm = worldMats[wi];
            if (wm.alphaMode === "BLEND" || wm.transparent) { wm.opacity = 0.85 * k; }
            else { wm.transparent = true; wm.opacity = k; }
          }
          emberMat.transparent = true; emberMat.opacity = k;
          haloMat.opacity = 0.5 * k;
        } else if (worldMats[0].opacity !== 1) {
          for (var wj = 0; wj < worldMats.length; wj++) {
            var wn = worldMats[wj];
            if (wn.alphaMode === "BLEND") { wn.opacity = 0.85; }
            else { wn.transparent = false; wn.opacity = 1; }
          }
          emberMat.transparent = false; emberMat.opacity = 1;
          haloMat.opacity = 0.5;
        }
      }

      /* embers drift up and loop — slow */
      if (embers) {
        var mxe = new THREE.Matrix4();
        for (var i = 0; i < emberData.length; i++) {
          var d = emberData[i];
          var y = d.y0 + ((t * d.speed) % 16);
          if (y > 9) y -= 16;
          var wob = Math.sin(t * d.sway + i) * 0.4;
          var ex = Math.cos(d.a) * d.r + wob, ez = Math.sin(d.a) * d.r + wob * 0.6;
          var sc = reduce ? d.s : d.s * (0.8 + 0.2 * Math.sin(t * 0.9 + i));
          mxe.makeScale(sc, sc, sc);
          mxe.setPosition(ex, y, ez);
          embers.setMatrixAt(i, mxe);
          haloPos[i * 3] = ex; haloPos[i * 3 + 1] = y; haloPos[i * 3 + 2] = ez;
        }
        embers.instanceMatrix.needsUpdate = true;
        haloGeo.attributes.position.needsUpdate = true;
      }

      /* the key sways — slow shadow movement across the terrain */
      if (keyLight && !reduce) {
        keyLight.position.x = 6 + Math.sin(t * 0.055) * 1.6;
        keyLight.position.z = 7 + Math.cos(t * 0.042) * 1.6;
      }
      if (himLight && !reduce) himLight.intensity = 1.0 + Math.sin(t * 0.5) * 0.08;

      /* him: breathing + cursor gaze */
      var breath = 1 + Math.sin((t / 3.2) * Math.PI * 2) * 0.014;
      groups.torso.scale.y = breath;
      groups.armR.scale.y = groups.armL.scale.y = 1 + (breath - 1) * 0.6;
      if (pointerActive) { yaw += (targetYaw - yaw) * 0.05; pitch += (targetPitch - pitch) * 0.05; }
      groups.head.rotation.y = yaw;
      groups.head.rotation.x = pitch;

      /* camera: idle drift + gentle scroll response + soft parallax */
      var p = progress, cam = camera;
      var bx, by, bz, lookY = 1.8;
      if (p < 0.5) {
        var a = easeInOut(p / 0.5);
        bx = 0.8 - 0.3 * a; by = 5.4 - 1.9 * a; bz = (mobile ? 28.0 : 26.0) - (mobile ? 6.0 : 6.2) * a;
        lookY = 1.6 - 0.3 * a;
      } else {
        var b2 = easeOut((p - 0.5) / 0.5);
        bx = 0.5 + 2.8 * b2; by = 3.5 + 4.2 * b2; bz = (mobile ? 22.0 : 19.8) + 3.4 * b2;
        lookY = 1.3 - 1.7 * b2;
      }
      if (!reduce) {
        /* slow pan around the chunk + a whisper of vertical breathing */
        var pan = Math.sin(t * 0.042) * 0.10;
        var dist = bz - 0.8, ang = Math.atan2(bx - 0.5, dist);
        var na = ang + pan;
        var r = Math.hypot(bx - 0.5, dist);
        bx = 0.5 + Math.sin(na) * r;
        bz = 0.8 + Math.cos(na) * r;
        by += Math.sin(t * 0.03) * 0.25;
      }
      cam.position.set(bx + parallaxX, by + parallaxY, bz);
      cam.lookAt(-2.2, lookY, 0.5);  // composition: chunk right of center, type clear on the left

      renderer.render(scene, camera);
    }

    function loop() {
      if (disposed) return;
      var tSec = (performance.now() - timeOrigin) / 1000;
      if (intro < 1) intro = Math.min(1, intro + 0.014); // ~1.2s materialize
      applyFrame(tSec, intro);
      rafId = requestAnimationFrame(loop);
    }

    if (reduce) { applyFrame(null, 1); } else { loop(); }

    var ro = new ResizeObserver(function () {
      if (disposed) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.fov = host.clientWidth / host.clientHeight < 1 ? 52 : 42;
      camera.updateProjectionMatrix();
      if (reduce) applyFrame(null, 1);
    });
    ro.observe(host);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
      else if (!reduce && rafId === null && !disposed) { timeOrigin = performance.now(); loop(); }
    });
    window.addEventListener("pagehide", function () {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      boxGeo.dispose();
      if (worldRoot) worldRoot.traverse(function (o) { if (o.isMesh) { o.geometry.dispose(); } });
      worldMats.forEach(function (m) { m.dispose(); });
      if (embers) embers.material.dispose();
      haloGeo.dispose(); haloMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    });
  } catch (err) {
    if (host) host.style.display = "none"; // fallback image stays
    window.__islandErr = String(err && err.stack || err);
    console.warn("[chunk] unavailable (non-fatal):", err);
  }
})();
