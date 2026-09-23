import importlib.util, os, glob, struct, zlib
spec = importlib.util.spec_from_file_location("ew", "scripts/export-world.py")
ew = importlib.util.module_from_spec(spec); spec.loader.exec_module(ew)

SAVES = [
    r"C:\Users\fortn\AppData\Roaming\PrismLauncher\instances\6b6t Baritone 1.21.8\minecraft\saves\Hive Final",
    r"C:\Users\fortn\AppData\Roaming\PrismLauncher\instances\6b6t Baritone 1.21.8\minecraft\saves\hive v1",
    r"C:\Users\fortn\AppData\Roaming\PrismLauncher\instances\anarchy1.21.11\minecraft\saves\New World",
    r"C:\Users\fortn\AppData\Roaming\PrismLauncher\instances\donut smp\minecraft\saves\New World",
]

def scan_region(path, rx, rz):
    """fast scan: decompress each chunk, search for cherry/pink names in the raw bytes"""
    try:
        data = open(path, "rb").read()
    except Exception:
        return None
    hits = {"cherry": 0, "pink": 0, "chunks": 0}
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
        if b"cherry" in chunk:
            hits["cherry"] += 1
        if b"pink_petals" in chunk or b"pink_tulip" in chunk:
            hits["pink"] += 1
        hits["chunks"] += 1
    return hits

for save in SAVES:
    print("==", os.path.basename(save))
    for rp in sorted(glob.glob(os.path.join(save, "region", "*.mca"))):
        base = os.path.basename(rp)
        try:
            rx, rz = [int(x) for x in base.replace("r.", "").replace(".mca", "").split(".")]
        except Exception:
            continue
        if os.path.getsize(rp) < 1024: continue
        h = scan_region(rp, rx, rz)
        if h and h["cherry"]:
            print("   %s: %d chunks with cherry, %d with pink (of %d)" % (base, h["cherry"], h["pink"], h["chunks"]))
