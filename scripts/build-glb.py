"""ember — build-glb.py
window of real Minecraft blocks → atlas (real jar textures) → face-culled
meshes → .glb + sidecar JSON (lights, bounds) + a top-down preview PNG.

usage: python build-glb.py X0 X1 Z0 Z1 Y0 Y1 outname
"""
import struct, sys, os, math, json, importlib.util, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ew", os.path.join(HERE, "export-world.py"))
ew = importlib.util.module_from_spec(spec); spec.loader.exec_module(ew)

def resolve(name):
    k = name.replace("minecraft:", "")
    if k in ew.TEXTURE_MAP:
        t = ew.TEXTURE_MAP[k]
        if len(t) == 1: return {"top": t[0], "side": t[0], "bottom": t[0]}
        if len(t) == 2: return {"top": t[0], "side": t[1], "bottom": t[0]}
        return {"top": t[0], "side": t[1], "bottom": t[2] or t[0]}
    return None

def is_glow(name, props):
    k = name.replace("minecraft:", "")
    if k in ew.EMISSIVE:
        if "bulb" in k or "campfire" in k:
            return props.get("lit", "true") != "false"
        return True
    return False

FACES = [
    (( 1, 0, 0), [(1,0,1),(1,0,0),(1,1,0),(1,1,1)]),
    ((-1, 0, 0), [(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),
    (( 0, 1, 0), [(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),
    (( 0,-1, 0), [(0,0,0),(1,0,0),(1,0,1),(0,0,1)]),
    (( 0, 0, 1), [(0,0,1),(1,0,1),(1,1,1),(0,1,1)]),
    (( 0, 0,-1), [(1,0,0),(0,0,0),(0,1,0),(1,1,0)]),
]
U_IDX = [0, 2, 2, 0]; V_IDX = [5, 5, 1, 1]

def main():
    X0, X1, Z0, Z1, Y0, Y1 = [int(v) for v in sys.argv[1:7]]
    NAME = sys.argv[7] if len(sys.argv) > 7 else "world"

    # ---- gather blocks in the window from the real region files
    blocks = {}   # (x,y,z) -> (name, props)
    cxa, cxb = X0 // 16, X1 // 16
    cza, czb = Z0 // 16, Z1 // 16
    regions = set((cx // 32, cz // 32) for cx in range(cxa, cxb + 1) for cz in range(cza, czb + 1))
    ew.WORLD = os.environ.get("EMBER_WORLD", os.path.join(ew.PRISM, "saves", "Hive Final"))
    for rx, rz in sorted(regions):
        for cx, cz, root in ew.region_chunks(rx, rz):
            if not (cxa <= cx <= cxb and cza <= cz <= czb): continue
            for (lx, y, lz, name, props) in ew.chunk_blocks(root):
                bx = cx * 16 + lx; bz = cz * 16 + lz
                if Y0 <= y <= Y1 and X0 <= bx <= X1 and Z0 <= bz <= Z1:
                    blocks[(bx, y, bz)] = (name, props)
    print("window blocks:", len(blocks))

    # ---- classify
    meshes = {"opaque": [], "cutout": [], "glow": [], "blend": []}
    skipped = {}
    occl = {}
    for pos, (name, props) in blocks.items():
        k = name.replace("minecraft:", "")
        if k == "water" or k == "flowing_water":
            meshes["blend"].append(pos); continue
        r = resolve(name)
        if r is None:
            skipped[k] = skipped.get(k, 0) + 1
            continue
        if is_glow(name, props):
            meshes["glow"].append(pos); occl[pos] = False
        elif k in ew.CUTOUT:
            meshes["cutout"].append(pos); occl[pos] = False
        else:
            meshes["opaque"].append(pos); occl[pos] = True
    print("meshes:", {m: len(v) for m, v in meshes.items()})
    print("skipped top:", sorted(skipped.items(), key=lambda kv: -kv[1])[:12])

    # ---- textures + atlas
    tex = ew.load_jar_textures()
    used = []
    def tile_of(tname):
        if tname not in used: used.append(tname)
        return used.index(tname)
    # ensure every needed texture exists
    for pos in meshes["opaque"] + meshes["cutout"] + meshes["glow"]:
        name, props = blocks[pos]
        r = resolve(name)
        for t in set(r.values()):
            if t not in tex:
                print("  !! missing texture skipped:", t, "(", name, ")")
                continue
            tile_of(t)
    if "water_still" in tex: tile_of("water_still")

    # biome tints: modern MC grass/leaf textures are GRAYSCALE, tinted at runtime.
    # tint only the desaturated pixels (the overlay), leave saturated dirt alone.
    TINTS = {
        "grass_block_top": (0x91, 0xBD, 0x59), "grass_block_side": (0x91, 0xBD, 0x59),
        "oak_leaves": (0x59, 0xAE, 0x30), "jungle_leaves": (0x59, 0xAE, 0x30),
        "acacia_leaves": (0x6A, 0x70, 0x39), "dark_oak_leaves": (0x59, 0xAE, 0x30),
        "birch_leaves": (0x80, 0xA7, 0x55), "spruce_leaves": (0x61, 0x99, 0x61),
        "mangrove_leaves": (0x8D, 0xB1, 0x27),
    }
    TILE, COLS = 16, 8
    rows = math.ceil(len(used) / COLS)
    AW, AH = COLS * TILE, rows * TILE
    atlas = bytearray(AW * AH * 4)
    for i, tname in enumerate(used):
        w, h, px = ew.png_rgba(tex[tname])
        cx, cy = i % COLS, i // COLS
        tint = TINTS.get(tname)
        for y in range(min(16, h)):
            for x in range(min(16, w)):
                si = (y * w + x) * 4
                di = ((cy * TILE + y) * AW + cx * TILE + x) * 4
                r, g, b2, a = px[si], px[si + 1], px[si + 2], px[si + 3]
                if tint and a > 0:
                    mx, mn = max(r, g, b2), min(r, g, b2)
                    if mx - mn < 24:      # desaturated = tintable overlay/grayscale pixel
                        r = (r * tint[0]) // 255
                        g = (g * tint[1]) // 255
                        b2 = (b2 * tint[2]) // 255
                atlas[di] = r; atlas[di + 1] = g; atlas[di + 2] = b2; atlas[di + 3] = a
    atlas_png = ew.png_write(os.path.join(ew.SITE, "assets", NAME + "-atlas.png"), AW, AH, bytes(atlas))
    print("atlas:", len(used), "tiles,", AW, "x", AH)

    def uv_for(tname):
        i = used.index(tname)
        cx, cy = i % COLS, i // COLS
        u0 = cx * TILE / AW; u1 = (cx * TILE + TILE) / AW
        v0 = cy * TILE / AH; v1 = (cy * TILE + TILE) / AH
        return (u0, v0, u1, v1)

    # ---- geometry per mesh (face-culled)
    meshes_data = {}
    for mname, plist in meshes.items():
        pos, nor, uv, idx = [], [], [], []
        vc = 0
        for bx, by, bz in plist:
            name, props = blocks[(bx, by, bz)]
            r = resolve(name) if mname != "blend" else {"top": "water_still", "side": "water_still", "bottom": "water_still"}
            if mname == "glow":
                col = ew.EMISSIVE.get(name.replace("minecraft:", ""), 0xffb259)
            for (d, verts) in FACES:
                nb = (bx + d[0], by + d[1], bz + d[2])
                nb_name = blocks.get(nb)
                nb_op = bool(nb_name) and occl.get(nb, False)
                if nb_op:
                    continue
                if mname == "blend" and nb_name and nb_name[0].replace("minecraft:", "") in ("water", "flowing_water"):
                    continue
                tname = r["top"] if d[1] == 1 else (r["bottom"] if d[1] == -1 else r["side"])
                u0, v0, u1, v1 = uv_for(tname)
                uvs = (u0, v0, u1, v0, u1, v1, u0, v1)
                for vi in range(4):
                    vx = verts[vi]
                    pos.append((bx + vx[0], by + vx[1], bz + vx[2]))
                    nor.append(d)
                    uv.append((uvs[U_IDX[vi]], uvs[V_IDX[vi]]))
                idx.extend((vc, vc + 1, vc + 2, vc, vc + 2, vc + 3))
                vc += 4
        meshes_data[mname] = {"pos": pos, "nor": nor, "uv": uv, "idx": idx, "tris": len(idx) // 3}
        print(mname, "tris:", len(idx) // 3)

    # ---- center the window
    cxm = (X0 + X1 + 1) / 2.0; czm = (Z0 + Z1 + 1) / 2.0
    for m in meshes_data.values():
        m["pos"] = [(px - cxm, py, pz - czm) for (px, py, pz) in m["pos"]]

    # ---- GLB
    def write_glb(path):
        bin_parts = []
        offset = 0
        accessors = []; bufferViews = []; meshdefs = []
        def add_view(data, target=None):
            nonlocal offset
            bv = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
            if target: bv["target"] = target
            bufferViews.append(bv)
            bin_parts.append(data)
            offset += len(data)
            while offset % 4:
                bin_parts.append(b"\x00"); offset += 1
            return len(bufferViews) - 1
        def add_accessor(bv, comp, typ, count, mins=None, maxs=None):
            a = {"bufferView": bv, "componentType": comp, "count": count, "type": typ}
            if mins is not None:
                a["min"] = mins; a["max"] = maxs
            accessors.append(a)
            return len(accessors) - 1

        materials = []
        def mat(name, alpha_mode="OPAQUE", unlit=False):
            m = {"name": name, "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.95}, "doubleSided": False}
            if alpha_mode != "OPAQUE":
                m["alphaMode"] = alpha_mode
                if alpha_mode == "MASK": m["alphaCutoff"] = 0.5
            if unlit is False and name == "blend":
                m["pbrMetallicRoughness"]["baseColorFactor"] = [0.30, 0.52, 0.72, 0.85]
            if unlit: m["extensions"] = {"KHR_materials_unlit": {}}
            materials.append(m)
            return len(materials) - 1

        order = [("opaque", "OPAQUE", False), ("cutout", "MASK", False), ("glow", "OPAQUE", True), ("blend", "BLEND", False)]
        for mname, amode, unlit in order:
            m = meshes_data[mname]
            if not m["idx"]: continue
            flat_pos = []
            for (px, py, pz) in m["pos"]:
                flat_pos += [px, py, pz]
            flat_nor = []
            for n in m["nor"]:
                flat_nor += [n[0], n[1], n[2]]
            flat_uv = []
            for u in m["uv"]:
                flat_uv += [u[0], u[1]]
            pdat = struct.pack("<%df" % len(flat_pos), *flat_pos)
            ndat = struct.pack("<%df" % len(flat_nor), *flat_nor)
            udat = struct.pack("<%df" % len(flat_uv), *flat_uv)
            idat = struct.pack("<%dI" % len(m["idx"]), *m["idx"])
            mins = [min(flat_pos[i::3]) for i in range(3)]
            maxs = [max(flat_pos[i::3]) for i in range(3)]
            vb = add_view(pdat, 34962); apos = add_accessor(vb, 5126, "VEC3", len(flat_pos) // 3, mins, maxs)
            vb = add_view(ndat, 34962); anor = add_accessor(vb, 5126, "VEC3", len(flat_nor) // 3)
            vb = add_view(udat, 34962); auv = add_accessor(vb, 5126, "VEC2", len(flat_uv) // 2)
            vb = add_view(idat, 34963); aidx = add_accessor(vb, 5125, "SCALAR", len(m["idx"]))
            mi = mat(mname, amode, unlit)
            meshdefs.append({"primitives": [{"attributes": {"POSITION": apos, "NORMAL": anor, "TEXCOORD_0": auv}, "indices": aidx, "material": mi}], "name": mname})

        img_bv = add_view(atlas_png)
        buf = b"".join(bin_parts)
        gltf = {
            "asset": {"version": "2.0", "generator": "ember export-world (real Hive world, 1.21.11.jar textures)"},
            "extensionsUsed": ["KHR_materials_unlit"],
            "scene": 0,
            "scenes": [{"nodes": list(range(len(meshdefs)))}],
            "nodes": [{"mesh": i, "name": meshdefs[i]["name"]} for i in range(len(meshdefs))],
            "meshes": meshdefs,
            "materials": materials,
            "textures": [{"sampler": 0, "source": 0}],
            "images": [{"bufferView": img_bv, "mimeType": "image/png"}],
            "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 33071, "wrapT": 33071}],
            "accessors": accessors,
            "bufferViews": bufferViews,
            "buffers": [{"byteLength": len(buf)}],
        }
        js = json.dumps(gltf, separators=(",", ":")).encode()
        while len(js) % 4: js += b" "
        total = 12 + 8 + len(js) + 8 + len(buf)
        out = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(buf), 0x004E4942) + buf
        open(path, "wb").write(out)
        return len(out)

    os.makedirs(os.path.join(ew.SITE, "assets"), exist_ok=True)
    glb_path = os.path.join(ew.SITE, "assets", NAME + ".glb")
    size = write_glb(glb_path)
    print("glb:", glb_path, round(size / 1024), "KB")

    # ---- stage points: (a) the grass nearest the middle, (b) a FRONT one:
    # low elevation, on the camera-facing half — so the figure reads INSIDE
    # the scene, not silhouetted on the horizon
    stage = None
    midx = (X0 + X1) / 2.0; midz = (Z0 + Z1) / 2.0
    best = None
    for (bx, by, bz), (name, props) in blocks.items():
        if name.replace("minecraft:", "") != "grass_block": continue
        if any((bx, by + h, bz) in blocks for h in (1, 2, 3)): continue
        # prefer CLEAN grass: penalty for petals/plants on the four neighbours
        clutter = 0
        for nx in (-1, 0, 1):
            for nz in (-1, 0, 1):
                nb = blocks.get((bx + nx, by + 1, bz + nz))
                if nb and ("petals" in nb[0] or "grass" in nb[0].replace("grass_block", "")):
                    clutter += 1
        d = (bx - midx) ** 2 + (bz - midz) ** 2 + clutter * 40
        if best is None or d < best[0]:
            best = (d, bx, by, bz)
    if best:
        stage = {"x": best[1] - cxm, "y": best[2] + 1, "z": best[3] - czm}
    # front stage: grass in the camera-facing 45% of the window, lowest height
    fbest = None
    zcut = Z0 + (Z1 - Z0) * 0.55
    for (bx, by, bz), (name, props) in blocks.items():
        if name.replace("minecraft:", "") != "grass_block": continue
        if bz < zcut: continue
        if any((bx, by + h, bz) in blocks for h in (1, 2, 3)): continue
        score = by * 1000 + ((bx - midx) ** 2 + (bz - midz) ** 2) * 0.01
        if fbest is None or score < fbest[0]:
            fbest = (score, bx, by, bz)
    stage_front = None
    if fbest:
        stage_front = {"x": fbest[1] - cxm, "y": fbest[2] + 1, "z": fbest[3] - czm}
    # hero stage: front-right quadrant, lowest ground — where the figure reads best
    hbest = None
    xcut = X0 + (X1 - X0) * 0.55
    for (bx, by, bz), (name, props) in blocks.items():
        if name.replace("minecraft:", "") != "grass_block": continue
        if bz < zcut or bx < xcut: continue
        if any((bx, by + h, bz) in blocks for h in (1, 2, 3)): continue
        score = by * 1000 + ((bx - xcut) ** 2 + (bz - zcut) ** 2) * 0.02
        if hbest is None or score < hbest[0]:
            hbest = (score, bx, by, bz)
    stage_hero = None
    if hbest:
        stage_hero = {"x": hbest[1] - cxm, "y": hbest[2] + 1, "z": hbest[3] - czm}

    # ---- sidecar: lights + bounds
    lights = []
    for pos in meshes["glow"]:
        name, props = blocks[pos]
        col = ew.EMISSIVE.get(name.replace("minecraft:", ""), 0xffb259)
        lights.append({"x": pos[0] - cxm, "y": pos[1], "z": pos[2] - czm, "color": col})
    # sample down if many
    if len(lights) > 40:
        step = len(lights) // 40 + 1
        lights = lights[::step]
    # stage beside the tree: the cherry log nearest the front-right, he stands 2 blocks toward the camera
    tbest = None
    for (bx, by, bz), (name, props) in blocks.items():
        if name.replace("minecraft:", "") != "cherry_log": continue
        score = (bz - Z1) ** 2 + (bx - (X0 + 0.7 * (X1 - X0))) ** 2
        if tbest is None or score < tbest[0]:
            tbest = (score, bx, by, bz)
    stage_tree = None
    if tbest:
        sx, sy, sz = tbest[1], tbest[2], tbest[3]
        # stand two blocks toward +z (camera side) at the log's base height
        stage_tree = {"x": sx + 2 - cxm, "y": sy, "z": sz + 2 - czm}

    meta = {
        "stage": stage,
        "stageTree": stage_tree,
        "stageFront": stage_front,
        "stageHero": stage_hero,
        "bounds": {"x": X1 - X0 + 1, "z": Z1 - Z0 + 1, "y0": Y0, "y1": Y1},
        "center": {"x": cxm, "z": czm},
        "lights": lights,
        "counts": {m: meshes_data[m]["tris"] for m in meshes_data},
    }
    json.dump(meta, open(os.path.join(ew.SITE, "assets", NAME + "-meta.json"), "w"), indent=1)
    print("meta: %d lights, %d tris total" % (len(lights), sum(v["tris"] for v in meshes_data.values())))

    # ---- top-down preview (1px per block, average of the side texture)
    pw, ph = X1 - X0 + 1, Z1 - Z0 + 1
    SCALE = 6
    img = bytearray(pw * ph * 4)
    avgs = {}
    for tname in used:
        w, h, px = ew.png_rgba(tex[tname])
        r = g = b = n = 0
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                i = (y * w + x) * 4
                if px[i + 3] < 32: continue
                r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1
        avgs[tname] = (r // max(1, n), g // max(1, n), b // max(1, n))
    for (bx, by, bz), (name, props) in blocks.items():
        k = name.replace("minecraft:", "")
        if k in ew.CUTOUT or k == "water": continue
        r = resolve(name)
        if not r: continue
        col = avgs[r["top"]]
        # topmost solid per column
        cur = img[((bz - Z0) * pw + (bx - X0)) * 4 + 3]
        cury = img[((bz - Z0) * pw + (bx - X0)) * 4 + 3]
        if by + 1 >= (cury or 0):
            i = ((bz - Z0) * pw + (bx - X0)) * 4
            img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2]; img[i + 3] = by + 1
    out = bytearray(pw * SCALE * ph * SCALE * 4)
    for y in range(ph):
        for x in range(pw):
            i = (y * pw + x) * 4
            c = (img[i], img[i + 1], img[i + 2]) if img[i + 3] else (16, 14, 12)
            for yy in range(SCALE):
                for xx in range(SCALE):
                    o = (((ph - 1 - y) * SCALE + yy) * pw * SCALE + x * SCALE + xx) * 4
                    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255
    ew.png_write(os.path.join(ew.SITE, "assets", NAME + "-preview.png"), pw * SCALE, ph * SCALE, bytes(out))
    print("preview written")


if __name__ == "__main__":
    main()
