"""Stand-in for mini-pylon's tools/tweak_server.py: the two parts the knobs
capture runs, copied as they are there. write_swatch_png draws the flat PNG
--fake renders, and Renders.finals lists the finals in
renders/hyperreal/tweaks/. The queue, Blender and the HTTP server are left out.
"""
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import scene_params  # noqa: E402,F401


def write_swatch_png(path, size, values):
    """A flat PNG whose colour follows the values: a stand-in render for --fake and tests."""
    digest = hashlib.sha1(json.dumps(values, sort_keys=True).encode()).digest()
    rgb = bytes(64 + b // 2 for b in digest[:3])
    raw = b"".join(b"\x00" + rgb * size for _ in range(size))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(png)


class Renders:
    def __init__(self, finals_dir):
        self.finals_dir = Path(finals_dir)

    def finals(self):
        """Every final, newest queued first: done ones with their image, and the ones still
        queued, rendering, or failed."""
        out = []
        for side in self.finals_dir.glob("*.json"):
            png = side.with_suffix(".png")
            try:
                data = json.loads(side.read_text())
            except ValueError:
                continue
            state = data.get("state") or ("done" if png.exists() else "failed")
            done = state == "done" and png.exists()
            out.append({"name": data.get("name") or png.stem, "file": png.name, "state": state,
                        "url": f"/out/finals/{png.name}" if done else None, "size": data.get("size"),
                        "queued": data.get("queued"), "rendered": data.get("rendered"),
                        "error": data.get("error"), "values": data.get("values", {}),
                        "_order": data.get("queued") or data.get("rendered") or ""})
        out.sort(key=lambda f: (f.pop("_order"), f["file"]), reverse=True)
        return out
