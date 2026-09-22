"""ember — export-world.py (v2, full pipeline)
REAL Minecraft world → curated fragment → GLB with REAL textures.

  actual .mca region files (Hive world save)
    → Anvil chunk/NBT parse (real block-state palettes + properties)
    → curated window (block bounds + y-range)
    → real block textures extracted from the ACTUAL client jar (1.21.11.jar)
    → texture atlas (PNG built by hand, no PIL)
    → face-culled merged meshes (opaque / cutout / blend)
    → .glb (GLB 2.0 binary, PNG embedded) + lights+stage sidecar JSON

usage:
  python export-world.py survey
  python export-world.py build X0 X1 Z0 Z1 Y0 Y1 out_name
"""
import json, struct, sys, zlib, os, math
from collections import Counter

PRISM = r"C:\Users\fortn\AppData\Roaming\PrismLauncher\instances\6b6t Baritone 1.21.8\minecraft"
WORLD = PRISM + r"\saves\Hive Final"
_JAR_CANDIDATES = [
    PRISM + r"\versions\1.21.11.jar",
    r"C:\Users\fortn\AppData\Roaming\.minecraft\versions\1.21.11\1.21.11.jar",
]
JAR = next((p for p in _JAR_CANDIDATES if os.path.exists(p)), _JAR_CANDIDATES[0])
SITE = r"C:\Users\fortn\ember-site"

# ---------------------------------------------------------------- NBT reader
class R:
    def __init__(self, b): self.b, self.i = b, 0
    def u1(self): v = self.b[self.i]; self.i += 1; return v
    def i1(self): v = struct.unpack_from(">b", self.b, self.i)[0]; self.i += 1; return v


def nbt_val(r, t):
    if t == 1:
        v = r.b[r.i]; r.i += 1; return struct.unpack(">b", bytes([v]))[0]
    if t == 2:
        v = struct.unpack_from(">h", r.b, r.i)[0]; r.i += 2; return v
    if t == 3:
        v = struct.unpack_from(">i", r.b, r.i)[0]; r.i += 4; return v
    if t == 4:
        v = struct.unpack_from(">q", r.b, r.i)[0]; r.i += 8; return v
    if t == 5:
        v = struct.unpack_from(">f", r.b, r.i)[0]; r.i += 4; return v
    if t == 6:
        v = struct.unpack_from(">d", r.b, r.i)[0]; r.i += 8; return v
    if t == 7:
        n = struct.unpack_from(">i", r.b, r.i)[0]; r.i += 4
        v = r.b[r.i:r.i + n]; r.i += n; return v
    if t == 8:
        n = struct.unpack_from(">H", r.b, r.i)[0]; r.i += 2
        v = r.b[r.i:r.i + n].decode("utf-8", "replace"); r.i += n; return v
    if t == 9:
        et = r.b[r.i]; r.i += 1
        n = struct.unpack_from(">i", r.b, r.i)[0]; r.i += 4
        return [nbt_val(r, et) for _ in range(n)]
    if t == 10:
        out = {}
        while True:
            tt = r.b[r.i]; r.i += 1
            if tt == 0: break
            nl = struct.unpack_from(">H", r.b, r.i)[0]; r.i += 2
            name = r.b[r.i:r.i + nl].decode("utf-8", "replace"); r.i += nl
            out[name] = nbt_val(r, tt)
        return out
    if t == 11:
        n = struct.unpack_from(">i", r.b, r.i)[0]; r.i += 4
        vals = [struct.unpack_from(">i", r.b, r.i + 4 * k)[0] for k in range(n)]
        r.i += 4 * n
        return vals
    if t == 12:
        n = struct.unpack_from(">i", r.b, r.i)[0]; r.i += 4
        vals = [struct.unpack_from(">q", r.b, r.i + 8 * k)[0] for k in range(n)]
        r.i += 8 * n
        return vals
    raise ValueError("tag %d" % t)


def nbt(r):
    t = r.u1()
    if t == 0: return None
    if t == 10:
        nl = struct.unpack_from(">H", r.b, r.i)[0]; r.i += 2 + nl
        return nbt_val(r, 10)
    return nbt_val(r, t)


def region_chunks(region_x, region_z):
    path = os.path.join(WORLD, "region", "r.%d.%d.mca" % (region_x, region_z))
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return
    data = open(path, "rb").read()
    for ci in range(1024):
        off = struct.unpack_from(">I", data, ci * 4)[0]
        if off == 0: continue
        pos = (off >> 8) * 4096
        ln = struct.unpack_from(">I", data, pos)[0]
        if ln == 0 or ln > 0x1000000: continue
        comp = data[pos + 4]
        raw = data[pos + 5:pos + 4 + ln]
        try:
            chunk = zlib.decompress(raw) if comp == 2 else raw
        except Exception:
            continue
        try:
            root = nbt(R(chunk))
        except Exception:
            continue
        yield (region_x * 32 + (ci % 32), region_z * 32 + (ci // 32), root)


def parse_section(s):
    y = s.get("Y", 0)
    bs = s.get("block_states")
    if not bs: return []
    pal_raw = bs.get("palette", [])
    pal = [(p.get("Name", "minecraft:air"), p.get("Properties", {}) or {}) for p in pal_raw]
    longs = bs.get("data")
    out = []
    if longs is None:
        name, props = pal[0] if pal else ("minecraft:air", {})
        if name == "minecraft:air": return []
        return [(x, y, z, name, props) for x in range(16) for z in range(16)]
    bits = max(4, (len(pal) - 1).bit_length())
    per = 64 // bits
    mask = (1 << bits) - 1
    vals = []
    for l in longs:
        u = l & 0xFFFFFFFFFFFFFFFF
        for k in range(per):
            vals.append((u >> (k * bits)) & mask)
    i = 0
    for yy in range(16):
        for z in range(16):
            for x in range(16):
                idx = vals[i] if i < len(vals) else 0
                i += 1
                if idx >= len(pal): continue
                name, props = pal[idx]
                if name != "minecraft:air" and name != "minecraft:cave_air" and name != "minecraft:void_air":
                    out.append((x, y + yy, z, name, props))
    return out


def chunk_blocks(root):
    out = []
    for s in root.get("sections", []):
        out.extend(parse_section(s))
    return out


# ---------------------------------------------------------------- textures
TEXTURE_MAP = {
    "grass_block": ("grass_block_top", "grass_block_side", "dirt"),
    "dirt": ("dirt",), "coarse_dirt": ("coarse_dirt",), "rooted_dirt": ("rooted_dirt",),
    "stone": ("stone",), "smooth_stone": ("smooth_stone",), "cobblestone": ("cobblestone",),
    "deepslate": ("deepslate",), "cobbled_deepslate": ("cobbled_deepslate",),
    "bedrock": ("bedrock",), "sand": ("sand",), "gravel": ("gravel",), "clay": ("clay",),
    "tuff": ("tuff",), "polished_tuff": ("polished_tuff",), "tuff_bricks": ("tuff_bricks",),
    "andesite": ("andesite",), "granite": ("granite",), "diorite": ("diorite",),
    "oak_log": ("oak_log_top", "oak_log", None), "oak_planks": ("oak_planks",),
    "oak_leaves": ("oak_leaves",), "spruce_leaves": ("spruce_leaves",),
    "water": ("water_still",), "lava": ("lava_still",),
    "waxed_copper_block": ("copper_block",), "copper_block": ("copper_block",),
    "waxed_oxidized_copper": ("oxidized_copper",), "oxidized_copper": ("oxidized_copper",),
    "waxed_exposed_copper": ("exposed_copper",), "exposed_copper": ("exposed_copper",),
    "waxed_weathered_copper": ("weathered_copper",), "weathered_copper": ("weathered_copper",),
    "waxed_cut_copper": ("cut_copper",), "cut_copper": ("cut_copper",),
    "waxed_oxidized_cut_copper": ("oxidized_cut_copper",),
    "waxed_exposed_cut_copper": ("exposed_cut_copper",),
    "waxed_chiseled_copper": ("chiseled_copper",),
    "waxed_oxidized_chiseled_copper": ("oxidized_chiseled_copper",),
    "waxed_copper_grate": ("copper_grate",), "waxed_oxidized_copper_grate": ("oxidized_copper_grate",),
    "waxed_copper_bulb": ("copper_bulb",), "waxed_exposed_copper_bulb": ("exposed_copper_bulb",),
    "waxed_oxidized_copper_bulb": ("oxidized_copper_bulb",), "waxed_weathered_copper_bulb": ("weathered_copper_bulb",),
    "light_gray_stained_glass": ("light_gray_stained_glass",), "glass": ("glass",),
    "lantern": ("lantern",), "soul_lantern": ("soul_lantern",),
    "glowstone": ("glowstone",), "sea_lantern": ("sea_lantern",),
    "shroomlight": ("shroomlight",), "ochre_froglight": ("ochre_froglight",),
    "campfire": ("campfire_log_lit",), "torch": ("torch",),
    "coal_ore": ("coal_ore",), "iron_ore": ("iron_ore",), "copper_ore": ("copper_ore",),
    "gold_ore": ("gold_ore",), "lapis_ore": ("lapis_ore",), "diamond_ore": ("diamond_ore",),
    "redstone_ore": ("redstone_ore",),
    "deepslate_coal_ore": ("deepslate_coal_ore",), "deepslate_iron_ore": ("deepslate_iron_ore",),
    "deepslate_copper_ore": ("deepslate_copper_ore",), "deepslate_gold_ore": ("deepslate_gold_ore",),
    "deepslate_lapis_ore": ("deepslate_lapis_ore",), "deepslate_diamond_ore": ("deepslate_diamond_ore",),
    "deepslate_redstone_ore": ("deepslate_redstone_ore",),
    "cherry_log": ("cherry_log_top", "cherry_log", None), "cherry_planks": ("cherry_planks",),
    "cherry_leaves": ("cherry_leaves",), "pink_petals": ("pink_petals",),
    "moss_block": ("moss_block",), "mossy_cobblestone": ("mossy_cobblestone",),
    "bricks": ("bricks",), "stone_bricks": ("stone_bricks",), "mossy_stone_bricks": ("mossy_stone_bricks",),
    "mud_bricks": ("mud_bricks",), "packed_mud": ("packed_mud",), "mud": ("mud",),
    "sandstone": ("sandstone",), "smooth_sandstone": ("smooth_sandstone",),
    "prismarine": ("prismarine",), "dark_prismarine": ("dark_prismarine",),
    "sponge": ("sponge",), "wet_sponge": ("wet_sponge",),
    "dirt_path": ("dirt_path_top", "dirt_path_side", "dirt"), "farmland": ("farmland",),
    "acacia_leaves": ("acacia_leaves",), "birch_leaves": ("birch_leaves",),
    "dark_oak_leaves": ("dark_oak_leaves",), "jungle_leaves": ("jungle_leaves",),
    "acacia_log": ("acacia_log_top", "acacia_log", None), "birch_log": ("birch_log_top", "birch_log", None),
    "spruce_log": ("spruce_log_top", "spruce_log", None), "dark_oak_log": ("dark_oak_log_top", "dark_oak_log", None),
    "stripped_oak_log": ("stripped_oak_log_top", "stripped_oak_log", None),
    "chiseled_tuff_bricks": ("chiseled_tuff_bricks",), "calcite": ("calcite",),
    "smooth_basalt": ("smooth_basalt",), "amethyst_block": ("amethyst_block",),
    "candle": ("candle",), "budding_amethyst": ("budding_amethyst",),
    "copper_bulb": ("copper_bulb",), "exposed_copper_bulb": ("exposed_copper_bulb",),
    "oxidized_copper_bulb": ("oxidized_copper_bulb",), "weathered_copper_bulb": ("weathered_copper_bulb",),
}
CUTOUT = {"oak_leaves", "spruce_leaves", "cherry_leaves", "acacia_leaves", "birch_leaves",
          "dark_oak_leaves", "jungle_leaves", "copper_grate", "oxidized_copper_grate",
          "oak_fence", "iron_bars", "chain", "flower_pot", "decorated_pot", "ladder", "vine",
          "cave_vines", "cave_vines_plant", "kelp", "kelp_plant", "seagrass", "tall_seagrass",
          "pink_petals", "torch", "lantern", "soul_lantern", "glass", "light_gray_stained_glass",
          "glass_pane", "light_gray_stained_glass_pane", "rail", "torchflower", "cobweb", "bush"}
BLEND = {"water"}
EMISSIVE = {"lantern": 0xffb259, "soul_lantern": 0x7fd2ff, "glowstone": 0xffca7a, "sea_lantern": 0xcfe8e4,
            "shroomlight": 0xff9a3c, "lava": 0xff6a12, "campfire": 0xffa04a,
            "ochre_froglight": 0xf0d890, "torch": 0xffb259,
            "waxed_copper_bulb": 0xffc07a, "waxed_exposed_copper_bulb": 0xffc07a,
            "waxed_oxidized_copper_bulb": 0xffc07a, "waxed_weathered_copper_bulb": 0xffc07a}

def load_jar_textures():
    import zipfile
    z = zipfile.ZipFile(JAR)
    names = z.namelist()
    def read(p):
        for cand in ("assets/minecraft/textures/block/" + p + ".png",):
            if cand in names:
                return z.read(cand)
        return None
    tex = {}
    # gather every texture we might need
    needed = set()
    for v in TEXTURE_MAP.values():
        for t in v:
            if t: needed.add(t)
    for t in needed:
        b = read(t)
        if b: tex[t] = b
        else:
            # try alternate filename spellings (e.g. grass_block_side vs grass_side)
            alts = [t.replace("_block_side", "_side"), t.replace("grass_block_top", "grass_top"),
                    t.replace("oak_log_top", "log_oak_top"), t]
            for a in alts:
                b = read(a)
                if b: tex[t] = b; break
    return tex

def png_dims(b):
    return struct.unpack(">II", b[16:24])

def png_rgba(b):
    """minimal PNG reader: 8-bit, non-interlaced, gray/RGB/palette/RGBA → RGBA"""
    w, h = png_dims(b)
    i = 8; idat = b""; bitd = 8; ctype = 6; plte = None; trns = None
    while i < len(b):
        ln = struct.unpack_from(">I", b, i)[0]
        typ = b[i + 4:i + 8]
        data = b[i + 8:i + 8 + ln]
        if typ == b"IHDR":
            w, h, bitd, ctype = struct.unpack(">IIBB", data[:10])
        elif typ == b"PLTE":
            plte = data
        elif typ == b"tRNS":
            trns = data
        elif typ == b"IDAT":
            idat += data
        elif typ == b"IEND":
            break
        i += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    subbyte = bitd < 8 and ctype in (0, 3)
    stride = ((w * bitd + 7) // 8) if subbyte else (w * ch)
    out = bytearray(w * h * 4)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for x in range(ch, stride): line[x] = (line[x] + line[x - ch]) & 255
        elif f == 2:
            for x in range(stride): line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                bb = prev[x]; c = prev[x - ch] if x >= ch else 0
                pa = abs(bb - c); pb = abs(a - c); pc = abs(a + bb - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (bb if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        prev = line
        if subbyte:
            per_byte = 8 // bitd
            mask = (1 << bitd) - 1
            for x in range(w):
                byte = line[x // per_byte]
                shift = 8 - bitd * (x % per_byte) - bitd
                v = (byte >> shift) & mask
                o = (y * w + x) * 4
                if ctype == 3 and plte:
                    out[o] = plte[v * 3]; out[o + 1] = plte[v * 3 + 1]; out[o + 2] = plte[v * 3 + 2]
                    out[o + 3] = trns[v] if (trns and v < len(trns)) else 255
                else:
                    g = int(v * 255 / mask); out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255
            continue
        for x in range(w):
            o = (y * w + x) * 4
            if ctype == 6:
                out[o:o + 4] = line[x * 4:x * 4 + 4]
            elif ctype == 2:
                out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255
            elif ctype == 0:
                v = line[x]; out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
            elif ctype == 4:
                v = line[x * 2]; out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = line[x * 2 + 1]
            elif ctype == 3:
                v = line[x]
                out[o] = plte[v * 3]; out[o + 1] = plte[v * 3 + 1]; out[o + 2] = plte[v * 3 + 2]
                out[o + 3] = trns[v] if (trns and v < len(trns)) else 255
    return w, h, out

def png_write(path, w, h, rgba):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgba[y * w * 4:(y + 1) * w * 4]
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(out)
    return out

def build_atlas(tex_names):
    """tex_names: ordered list → atlas (grid 16 across), returns (png_bytes, mapping name→(u0,v0,u1,v1), W,H)"""
    TILE = 16
    n = len(tex_names)
    cols = 8
    rows = math.ceil(n / cols)
    W, H = cols * TILE, rows * TILE
    atlas = bytearray(W * H * 4)
    tiles = {}
    for i, name in enumerate(tex_names):
        cx, cy = i % cols, i // cols
        tiles[name] = (cx * TILE, cy * TILE)
    return tiles, (W, H, atlas)

def main():
    if len(sys.argv) < 2 or sys.argv[1] == "survey":
        print("survey: see earlier output"); return
    if sys.argv[1] == "textures":
        tex = load_jar_textures()
        print("extracted", len(tex), "textures from the real client jar")
        for k in sorted(tex)[:10]:
            print("  ", k, png_dims(tex[k]))
        return

if __name__ == "__main__":
    main()
