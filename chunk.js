/* ============================================================
   ember — chunk.js
   ONE 16x16 Minecraft chunk, extracted from the world and displayed
   in the void. curated terrain: a low front clearing (his stage),
   a back-left rise, two small oaks, a stone outcrop, a 2x2 pool
   ringed in sand, and a tiny cobble ruin. straight readable edges,
   grass→dirt→stone slab, flat stone underside.

   - texture: procedural 16px atlas drawn on a canvas (nearest filter)
   - geometry: ONE merged BufferGeometry per material, internal faces
     culled → ~1 draw call. deterministic. no per-block animation.
   usd by scene.js. three.js r128 UMD.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- the atlas: 4x4 grid of 16px tiles, drawn by hand ---------- */
  var TILE = 16, GRID = 4;
  function makeAtlas() {
    var c = document.createElement("canvas");
    c.width = c.height = TILE * GRID;
    var x = c.getContext("2d");
    var rnd = (function (a) {
      return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    })(20260922);

    function noise(tx, ty, rgb, amp, opts) {
      opts = opts || {};
      var px = tx * TILE, py = ty * TILE;
      for (var i = 0; i < TILE; i++) for (var j = 0; j < TILE; j++) {
        var v = (rnd() * 2 - 1) * amp;
        x.fillStyle = "rgb(" + Math.round(rgb[0] + v) + "," + Math.round(rgb[1] + v) + "," + Math.round(rgb[2] + v) + ")";
        x.fillRect(px + i, py + j, 1, 1);
      }
      if (opts.speckle) {
        for (var s = 0; s < opts.speckle; s++) {
          x.fillStyle = "rgb(" + Math.round(rgb[0] + amp * 1.6) + "," + Math.round(rgb[1] + amp * 1.6) + "," + Math.round(rgb[2] + amp * 1.6) + ")";
          x.fillRect(px + ((rnd() * TILE) | 0), py + ((rnd() * TILE) | 0), 1, 1);
        }
      }
    }

    // row 0: grass top, grass top b, grass side, dirt
    noise(0, 0, [80, 134, 60], 16, { speckle: 14 });
    noise(1, 0, [72, 124, 54], 16, { speckle: 14 });
    // grass side: dirt base + ragged green cap
    noise(2, 0, [102, 74, 46], 12);
    for (var i = 0; i < TILE; i++) {
      var cap = 3 + ((rnd() < 0.5) ? 1 : 0);
      for (var j = 0; j < cap; j++) {
        var v = (rnd() * 2 - 1) * 16;
        x.fillStyle = "rgb(" + Math.round(95 + v) + "," + Math.round(154 + v) + "," + Math.round(70 + v) + ")";
        x.fillRect(2 * TILE + i, j, 1, 1);
      }
    }
    noise(3, 0, [102, 74, 46], 12);
    // row 1: stone, cobble, cobble b (mossy), log side
    noise(0, 1, [110, 114, 122], 10, { speckle: 10 });
    noise(1, 1, [98, 101, 107], 12);
    noise(2, 1, [93, 100, 90], 12);
    noise(3, 1, [82, 62, 42], 9);
    for (var g = 0; g < TILE; g++) {           // log grain
      x.fillStyle = "rgba(56,42,28,0.55)";
      x.fillRect(3 * TILE + g, 0, 1, TILE);
      if (rnd() < 0.5) x.fillRect(3 * TILE + ((rnd() * TILE) | 0), 0, 1, TILE);
    }
    // row 2: log top, leaves, leaves b, water
    noise(0, 2, [132, 104, 66], 8);
    (function () { // rings
      var px = 0, py = 2 * TILE;
      for (var r = 2; r < 9; r += 2) {
        x.strokeStyle = "rgba(90,64,40,0.8)";
        x.lineWidth = 1;
        x.beginPath(); x.arc(px + 8, py + 8, r, 0, Math.PI * 2); x.stroke();
      }
    })();
    noise(1, 2, [55, 110, 50], 20, { speckle: 22 });
    noise(2, 2, [49, 99, 45], 20, { speckle: 22 });
    noise(3, 2, [78, 150, 180], 8, { speckle: 12 });
    // row 3: sand, planks, gravel?, unused
    noise(0, 3, [198, 184, 140], 10, { speckle: 12 });
    noise(1, 3, [138, 106, 68], 9);
    for (var p = 0; p < TILE; p += 5) {        // plank seams
      x.fillStyle = "rgba(80,58,34,0.6)";
      x.fillRect(1 * TILE, 3 * TILE + p, TILE, 1);
    }
    noise(2, 3, [108, 104, 96], 14, { speckle: 16 });

    var tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* tile grid coords: [tx, ty] into the 4x4 atlas */
  var TILES = {
    grassTop: [[0, 0], [1, 0]], grassSide: [2, 0], dirt: [3, 0],
    stone: [0, 1], cobble: [[1, 1], [2, 1]], logSide: [3, 1],
    logTop: [0, 2], leaf: [[1, 2], [2, 2]], water: [3, 2],
    sand: [0, 3], plank: [1, 3], gravel: [2, 3],
  };

  /* ---------- the curated 16x16 layout ---------- */
  /* height map: deliberate terrain — front-right clearing flat (his stage),
     back-left rise, everything readable from the hero camera.
     computed ONCE up front so every later placement reads the same ground. */
  function heightAt(x, z, rand) {
    var h = 2;
    if (x < 7 && z < 7) h = 3;             // back-left rise
    if (x < 4 && z < 4) h = 4;             // its crown
    if (x >= 5 && x <= 6 && z >= 3 && z <= 4) h += 1;  // a mid roll
    if (rand() < 0.10 && !(x >= 12 && z >= 8)) h -= 1;  // lows, never under the pool
    if (x >= 8 && z >= 8) h = 2;           // the clearing (flat, curated — his stage)
    if (x >= 12 && z >= 8 && z <= 11) h = 1;  // the pool dip — open right zone, in view
    return Math.max(1, h);
  }

  window.buildEmberChunk = function () {
    var rand = (function (a) {
      return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    })(424242);

    var BOTTOM = -3;                       // flat stone underside — clean extraction
    var map = {};                          // "x,y,z" -> kind
    function put(x, y, z, kind) { map[x + "," + y + "," + z] = kind; }
    function get(x, y, z) { return map[x + "," + y + "," + z] || null; }

    var pool = [[13, 9], [14, 9], [13, 10], [14, 10]];     // 2x2 water, open right zone
    var sandRing = function (x, z) { return x >= 12 && x <= 15 && z >= 8 && z <= 11; };

    /* the height map — computed once, read everywhere */
    var H = [];
    for (var hx = 0; hx < 16; hx++) { H[hx] = []; for (var hz = 0; hz < 16; hz++) H[hx][hz] = heightAt(hx, hz, rand); }

    /* columns */
    for (var cx = 0; cx < 16; cx++) for (var cz = 0; cz < 16; cz++) {
      var h = H[cx][cz];
      var topKind = sandRing(cx, cz) ? "sand" : "grass";
      put(cx, h, cz, topKind);
      put(cx, h - 1, cz, "dirt");
      put(cx, h - 2, cz, "dirt");
      for (var y = h - 3; y >= BOTTOM; y--) put(cx, y, cz, "stone");
    }
    /* the pool: dug one deep — water source at y=0, the sand shoulder one
       above at y=1, so the surface reads SUNKEN from any camera */
    pool.forEach(function (p) {
      delete map[p[0] + ",1," + p[1]];     // remove the shoulder block over the hole
      put(p[0], 0, p[1], "water");         // the water replaces the dirt at y=0
    });

    /* two small oaks — back-left on the rise, and by the pool */
    function oak(tx, tz, trunkH) {
      var groundY = H[tx][tz];
      for (var t = 1; t <= trunkH; t++) put(tx, groundY + t, tz, "log");
      var topY = groundY + trunkH;
      for (var lx = -2; lx <= 2; lx++) for (var lz = -2; lz <= 2; lz++) for (var ly = 0; ly <= 2; ly++) {
        var d = Math.abs(lx) + Math.abs(ly - 1) + Math.abs(lz);
        if (d <= 3 && rand() > 0.2) put(tx + lx, topY + ly, tz + lz, "leaf");
      }
    }
    oak(4, 4, 4);        // on the back-left rise
    oak(12, 6, 3);       // mid-right, behind his clearing — depth

    /* stone outcrop — back-right, dwarf-scale, silhouetted on the ridge */
    var h1 = H[13][4];
    put(13, h1 + 1, 4, "stone");
    put(14, h1 + 1, 4, "cobble");
    put(13, h1 + 1, 3, "cobble");
    put(13, h1 + 2, 4, "stone");

    /* the ruin — cobbles and a plank, long abandoned (front, left of him) */
    var h2 = H[2][9];
    put(2, h2 + 1, 9, "cobble");
    put(2, h2 + 1, 10, "plank");
    put(3, h2 + 1, 9, "cobble");
    put(1, h2 + 1, 9, "cobble");

    /* one gravel pocket in the front-right dirt */
    put(14, H[14][14], 14, "gravel");

    /* ---------- merge geometry ---------- */
    var opaque = { pos: [], nor: [], uv: [], idx: [], vc: 0 };
    var water = { pos: [], nor: [], uv: [], idx: [], vc: 0 };
    var FACES = [
      /* every face winds CCW seen from OUTSIDE (verified in screen space),
         with verts ordered bottom-bottom-top-top so the side-tile cap lands up */
      { d: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      { d: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      { d: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
      { d: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { d: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      { d: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    ];
    function tileUV(tile) {
      var tx = tile[0], ty = tile[1];
      var u0 = tx / GRID, u1 = u0 + 1 / GRID;
      var vTop = 1 - ty / GRID, vBot = 1 - (ty + 1) / GRID;
      return [u0, vTop, u1, vTop, u1, vBot, u0, vBot]; // per-vertex, matched below
    }
    function facesFor(kind) {
      var pick = function (k) { var t = TILES[k]; return t[0] && t[0].length ? t[(rand() * t.length) | 0] : t; };
      if (kind === "grass") return { py: pick("grassTop"), pyn: pick("dirt"), s: pick("grassSide") };
      if (kind === "sand") { var s = TILES.sand; return { py: s, pyn: s, s: s }; }
      if (kind === "dirt") return { py: TILES.dirt, pyn: TILES.dirt, s: TILES.dirt };
      if (kind === "stone") return { py: TILES.stone, pyn: TILES.stone, s: TILES.stone };
      if (kind === "cobble") { var cb = pick("cobble"); return { py: cb, pyn: cb, s: cb }; }
      if (kind === "gravel") { var g = TILES.gravel; return { py: g, pyn: g, s: g }; }
      if (kind === "log") return { py: TILES.logTop, pyn: TILES.logTop, s: TILES.logSide };
      if (kind === "leaf") { var lf = pick("leaf"); return { py: lf, pyn: lf, s: lf }; }
      if (kind === "plank") { var pk = TILES.plank; return { py: pk, pyn: pk, s: pk }; }
      if (kind === "water") { var w = TILES.water; return { py: w, pyn: w, s: w }; }
      return { py: TILES.stone, pyn: TILES.stone, s: TILES.stone };
    }
    var OPAQUE = { grass: 1, sand: 1, dirt: 1, stone: 1, cobble: 1, gravel: 1, log: 1, leaf: 1, plank: 1 };

    Object.keys(map).forEach(function (key) {
      var p = key.split(","), bx = +p[0], by = +p[1], bz = +p[2];
      var kind = map[key];
      var isWater = kind === "water";
      var sink = isWater ? water : opaque;
      var f = facesFor(kind);
      for (var fi = 0; fi < FACES.length; fi++) {
        var face = FACES[fi];
        var nx = bx + face.d[0], ny = by + face.d[1], nz = bz + face.d[2];
        var nb = get(nx, ny, nz);
        /* cull: any opaque neighbour hides the face; water hides only water */
        if (nb) { if (nb === "water") { if (isWater) continue; } else continue; }
        var tile = face.d[1] === 1 ? f.py : (face.d[1] === -1 ? f.pyn : f.s);
        var uvs = tileUV(tile);
        var base = sink.vc;
        /* canonical box UVs: verts 0,1 take the tile's bottom row; 2,3 the top.
           (side textures have their grass cap on the canvas-top rows) */
        var U_IDX = [0, 2, 2, 0], V_IDX = [5, 5, 1, 1];
        for (var vi = 0; vi < 4; vi++) {
          var vtx = face.v[vi];
          sink.pos.push(bx + vtx[0], by + vtx[1], bz + vtx[2]);
          sink.nor.push(face.d[0], face.d[1], face.d[2]);
          sink.uv.push(uvs[U_IDX[vi]], uvs[V_IDX[vi]]);
        }
        sink.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        sink.vc += 4;
      }
    });

    function toGeo(s) {
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(s.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(s.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
      g.setIndex(s.idx);
      return g;
    }

    var tex = makeAtlas();
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.0, transparent: false });
    var mesh = new THREE.Mesh(toGeo(opaque), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    var waterMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.92, emissive: 0x2e7fa8, emissiveIntensity: 0.9 });
    var waterMesh = new THREE.Mesh(toGeo(water), waterMat);

    var group = new THREE.Group();
    group.add(mesh);
    group.add(waterMesh);

    return {
      group: group,
      mesh: mesh,
      waterMesh: waterMesh,
      bounds: { minY: BOTTOM, maxY: 4 + 4 + 3 },
      triCount: opaque.idx.length / 3,
      tileCount: Object.keys(map).length,
      mats: [mat, waterMat],
      dispose: function () { mesh.geometry.dispose(); waterMesh.geometry.dispose(); mat.dispose(); waterMat.dispose(); tex.dispose(); },
    };
  };
})();
