/* ============================================================
   ember — skinchar.js
   a REAL minecraft character: the actual 64x64 skin texture mapped
   onto proper per-face UV regions (the same mechanic the launcher
   uses), including the overlay layer (hat / jacket / sleeves / pants).

   window.buildSkinCharacter() → { root, groups, ready }
   groups: { head, torso, armL, armR, legL, legR } — head pivots at the
   neck, torso scales for breathing. feet at y = 0, 2 units tall.

   texture: assets/skin-data.js (window.EMBER_SKIN, a data: URL —
   works from file:// where http textures would taint the canvas).
   ============================================================ */

(function () {
  "use strict";

  var U = 1 / 16; // one minecraft pixel

  /* skin UV rects, in skin pixels (64x64), origin top-left.
     [right, front, left, back, top, bottom] per part */
  var RECTS = {
    head:      [[0,8,8,8],  [8,8,8,8],  [16,8,8,8],  [24,8,8,8],  [8,0,8,8],  [16,0,8,8]],
    torso:     [[16,20,4,12],[20,20,8,12],[28,20,4,12],[32,20,8,12],[20,16,8,4],[28,16,8,4]],
    armR:      [[40,20,4,12],[44,20,4,12],[48,20,4,12],[52,20,4,12],[44,16,4,4],[48,16,4,4]],
    armL:      [[32,52,4,12],[36,52,4,12],[40,52,4,12],[44,52,4,12],[36,48,4,4],[40,48,4,4]],
    legR:      [[0,20,4,12], [4,20,4,12], [8,20,4,12], [12,20,4,12],[4,16,4,4], [8,16,4,4]],
    legL:      [[16,52,4,12],[20,52,4,12],[24,52,4,12],[28,52,4,12],[20,48,4,4],[24,48,4,4]],
    /* overlay layer (second skin layer) */
    headHat:   [[32,8,8,8],  [40,8,8,8],  [48,8,8,8],  [56,8,8,8],  [40,0,8,8],  [48,0,8,8]],
    torsoJack: [[16,36,4,12],[20,36,8,12],[28,36,4,12],[32,36,8,12],[20,32,8,4],[28,32,8,4]],
    armRJack:  [[40,36,4,12],[44,36,4,12],[48,36,4,12],[52,36,4,12],[44,32,4,4],[48,32,4,4]],
    armLJack:  [[48,52,4,12],[52,52,4,12],[56,52,4,12],[40,52,4,12],[52,48,4,4],[56,48,4,4]],
    legRPant:  [[0,36,4,12], [4,36,4,12], [8,36,4,12], [12,36,4,12],[4,32,4,4], [8,32,4,4]],
    legLPant:  [[0,52,4,12], [4,52,4,12], [8,52,4,12], [12,52,4,12],[4,48,4,4], [8,48,4,4]],
  };

  /* part dimensions in minecraft pixels */
  var DIMS = {
    head:  [8, 8, 8],
    torso: [8, 12, 4],
    armR:  [4, 12, 4], armL: [4, 12, 4],
    legR:  [4, 12, 4], legL: [4, 12, 4],
  };

  function uvArray(rect) {
    var x = rect[0], y = rect[1], w = rect[2], h = rect[3];
    var u0 = x / 64, u1 = (x + w) / 64;
    var v0 = 1 - y / 64, v1 = 1 - (y + h) / 64;
    // PlaneGeometry vertex order: TL, TR, BL, BR
    return new Float32Array([u0, v0, u1, v0, u0, v1, u1, v1]);
  }

  /* six textured faces for one box, in [right, front, left, back, top, bottom] order */
  function faceBox(rects, dims, material, inflate) {
    var w = dims[0] * U, h = dims[1] * U, d = dims[2] * U;
    var s = inflate || 1;
    var g = new THREE.Group();
    var order = ["right", "front", "left", "back", "top", "bottom"];
    var geoCache = {};

    function face(i, pw, ph, pos, rot) {
      var key = pw.toFixed(4) + "x" + ph.toFixed(4);
      var geo = geoCache[key] || (geoCache[key] = new THREE.PlaneGeometry(pw, ph));
      var mesh = new THREE.Mesh(geo, material);
      mesh.geometry = geo.clone(); // own geometry: own UVs
      mesh.geometry.attributes.uv.array.set(uvArray(rects[i]));
      mesh.geometry.attributes.uv.needsUpdate = true;
      mesh.position.set(pos[0], pos[1], pos[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      g.add(mesh);
      return mesh;
    }

    var hw = (w / 2) * s, hh = (h / 2) * s, hd = (d / 2) * s;
    face(0, d * s, h, [hw, 0, 0], [0, Math.PI / 2, 0]);     // right (+x)
    face(1, w * s, h, [0, 0, hd], null);                    // front (+z)
    face(2, d * s, h, [-hw, 0, 0], [0, -Math.PI / 2, 0]);   // left (-x)
    face(3, w * s, h, [0, 0, -hd], [0, Math.PI, 0]);        // back (-z)
    face(4, w * s, d * s, [0, hh, 0], [-Math.PI / 2, 0, 0]); // top (+y)
    face(5, w * s, d * s, [0, -hh, 0], [Math.PI / 2, 0, 0]); // bottom (-y)
    return g;
  }

  window.buildSkinCharacter = function (opts) {
    opts = opts || {};
    var root = new THREE.Group();

    /* materials — start grey; the texture lands when it loads */
    var skinMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.78, metalness: 0.02 });
    var overMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.78, transparent: true, alphaTest: 0.5, depthWrite: true });

    var groups = {};
    ["head", "torso", "armR", "armL", "legR", "legL"].forEach(function (k) { groups[k] = new THREE.Group(); });

    /* base parts — feet at y=0 */
    groups.torso.position.set(0, 1.125, 0);
    groups.torso.add(faceBox(RECTS.torso, DIMS.torso, skinMat, 1));

    groups.head.position.set(0, 1.5, 0);                       // neck pivot
    var headBase = faceBox(RECTS.head, DIMS.head, skinMat, 1);
    headBase.position.y = 0.25;
    groups.head.add(headBase);
    var headHat = faceBox(RECTS.headHat, DIMS.head, overMat, 1.08);
    headHat.position.y = 0.25;
    groups.head.add(headHat);

    ["armR", "armL"].forEach(function (k) {
      var side = k === "armR" ? 1 : -1;
      groups[k].position.set(side * 0.375, 1.125, 0);
      groups[k].add(faceBox(RECTS[k], DIMS[k], skinMat, 1));
      groups[k].add(faceBox(RECTS[k + "Jack"], DIMS[k], overMat, 1.08));
    });

    ["legR", "legL"].forEach(function (k) {
      var side = k === "legR" ? 1 : -1;
      groups[k].position.set(side * 0.125, 0.375, 0);
      groups[k].add(faceBox(RECTS[k], DIMS[k], skinMat, 1));
      groups[k].add(faceBox(RECTS[k + "Pant"], DIMS[k], overMat, 1.08));
    });

    /* torso jacket overlay */
    groups.torso.add(faceBox(RECTS.torsoJack, DIMS.torso, overMat, 1.08));

    Object.keys(groups).forEach(function (k) { root.add(groups[k]); });

    /* the texture: embedded data URL (file:// safe) or any URL */
    var ready = new Promise(function (resolve) {
      var url = opts.textureUrl || window.EMBER_SKIN;
      if (!url) { resolve(false); return; }
      var loader = new THREE.TextureLoader();
      loader.load(url, function (tex) {
        tex.magFilter = THREE.NearestFilter;   // pixel art stays pixel art
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        skinMat.map = tex; skinMat.color.set(0xffffff); skinMat.needsUpdate = true;
        overMat.map = tex; overMat.color.set(0xffffff); overMat.needsUpdate = true;
        resolve(true);
      }, undefined, function () { resolve(false); }); // texture failed — grey stand-in stays
    });

    return { root: root, groups: groups, ready: ready };
  };
})();
