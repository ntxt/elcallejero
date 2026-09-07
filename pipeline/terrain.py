"""Bake a city's relief into the bundle, from public elevation tiles.

Source: AWS Terrain Tiles (registry.opendata.aws/terrain-tiles), the Mapzen
terrarium encoding, where a pixel's height in metres is

    (red * 256) + green + (blue / 256) - 32768

The tiles are fetched once at build time and resampled onto a single regular
grid covering the city, which the viewer uploads as one vertex buffer. Doing it
here rather than in the browser means the published page needs no tile server,
no API key and no network at all to draw the terrain -- which is also what lets
the whole platform work as a single self-contained file.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import math
import time
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "out"
CACHE = ROOT / "data" / "raw" / "terrain"

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TILE_PX = 256
ZOOM = 12                 # ~30 m per pixel at this latitude
GRID_W = 384              # output grid; 384x~300 is 115k vertices, a light mesh
UA = "callejero-feminista/1.0 (research; street-name analysis)"


def _tile_xy(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n
    return x, y


def _fetch(z: int, x: int, y: int) -> np.ndarray:
    from PIL import Image
    path = CACHE / f"{z}_{x}_{y}.png"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y),
                                     headers={"User-Agent": UA})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    path.write_bytes(r.read())
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 * (attempt + 1))
    img = np.asarray(Image.open(io.BytesIO(path.read_bytes())).convert("RGB"),
                     dtype=np.float32)
    return img[:, :, 0] * 256.0 + img[:, :, 1] + img[:, :, 2] / 256.0 - 32768.0


def heightfield(bbox: list[float], zoom: int = ZOOM, grid_w: int = GRID_W) -> dict:
    x0, y0, x1, y1 = bbox
    tx0, ty1 = _tile_xy(x0, y0, zoom)      # south-west -> larger tile y
    tx1, ty0 = _tile_xy(x1, y1, zoom)
    ix0, ix1 = math.floor(tx0), math.floor(tx1)
    iy0, iy1 = math.floor(ty0), math.floor(ty1)

    mosaic = np.zeros(((iy1 - iy0 + 1) * TILE_PX, (ix1 - ix0 + 1) * TILE_PX),
                      dtype=np.float32)
    total = (iy1 - iy0 + 1) * (ix1 - ix0 + 1)
    for n, ty in enumerate(range(iy0, iy1 + 1)):
        for tx in range(ix0, ix1 + 1):
            mosaic[(ty - iy0) * TILE_PX:(ty - iy0 + 1) * TILE_PX,
                   (tx - ix0) * TILE_PX:(tx - ix0 + 1) * TILE_PX] = _fetch(zoom, tx, ty)
    print(f"  {total} tiles at z{zoom} -> mosaic {mosaic.shape}")

    # Sample the mosaic on a grid that is regular in lon/lat, so the viewer can
    # map a coordinate to a height with two multiplications and no projection.
    aspect = (y1 - y0) / (x1 - x0) / math.cos(math.radians((y0 + y1) / 2))
    grid_h = max(int(round(grid_w * aspect)), 2)
    lons = np.linspace(x0, x1, grid_w)
    lats = np.linspace(y1, y0, grid_h)            # north to south, image order
    px = (np.array([_tile_xy(l, lats[0], zoom)[0] for l in lons]) - ix0) * TILE_PX
    py = (np.array([_tile_xy(lons[0], l, zoom)[1] for l in lats]) - iy0) * TILE_PX
    xi = np.clip(np.round(px).astype(int), 0, mosaic.shape[1] - 1)
    yi = np.clip(np.round(py).astype(int), 0, mosaic.shape[0] - 1)
    grid = mosaic[np.ix_(yi, xi)]

    # Sea shows up as small negative noise in the source; clamp it flat.
    grid = np.where(grid < 0, 0.0, grid)
    q = np.round(grid).astype(np.int16)
    return {
        "w": grid_w, "h": grid_h, "bbox": bbox,
        "min": float(grid.min()), "max": float(grid.max()),
        "zoom": zoom,
        "data": base64.b64encode(q.tobytes()).decode("ascii"),
        "attribution": "AWS Terrain Tiles / Mapzen (ODbL)",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--city", default="malaga")
    args = ap.parse_args()
    bundle = json.loads((OUT / f"{args.city}.json").read_text(encoding="utf-8"))
    bbox = bundle["city"]["bbox"]
    print(f"[{args.city}] terrain for {bbox}")
    field = heightfield(bbox)
    path = OUT / f"{args.city}.terrain.json"
    path.write_text(json.dumps(field, separators=(",", ":")), encoding="utf-8")
    print(f"[{args.city}] {path.name} {field['w']}x{field['h']} "
          f"{field['min']:.0f}-{field['max']:.0f} m, "
          f"{path.stat().st_size/1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
