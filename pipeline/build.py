"""Build a city's data bundle for the web platform.

    python -m pipeline.build --city malaga

Writes two files into data/out:

    <city>.json       everything but geometry -- the city record, the taxonomy,
                      the thesis comparison, and one row per vía
    <city>.geo.json   simplified geometry, addressed by the row index above

They are split because the workbench needs every attribute of every vía at once
to filter and chart, while the map only needs geometry for what is on screen;
keeping them apart lets the tables load and the charts draw before the geometry
has arrived.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

import numpy as np

from . import geo, metrics, taxonomy
from .text import deinvert, titlecase
from .classify import Classifier
from .registry import available, get_city
from .thesis import OUT as THESIS_DIR

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "out"
RAW = ROOT / "data" / "raw"

# Roughly a metre at Málaga's latitude; below this the shape of a street is
# carrying no information the screen can show.
SIMPLIFY_TOLERANCE_M = 3.0
COORD_DP = 5

# Columns whose values repeat across thousands of vías. Storing them as an
# index into a dictionary rather than as a string in every row takes the Málaga
# bundle from 2.8MB to well under a megabyte, which is what makes it small
# enough to inline into a single self-contained page.
INTERNED = ("kind", "kindLabel", "district", "barrio", "cat", "sub",
            "gender", "real", "rule", "why")


def _block_edges(city_id: str) -> list | None:
    """Outlines of the built blocks, for the corridor-width measurement."""
    path = RAW / city_id / "da_cartografiaManzana-4326.geojson"
    if not path.exists():
        return None
    rings = []
    for feature in json.loads(path.read_text(encoding="utf-8"))["features"]:
        g = feature["geometry"]
        if not g:
            continue
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            rings.extend(poly)
    return rings


def _thesis_reference() -> dict:
    """What Linares Rodríguez counted, so our own figures can be checked."""
    import csv
    out = {"source": "Linares Rodríguez (2024), Universidad de Granada",
           "handle": "https://hdl.handle.net/10481/88267"}
    for key, name in (("current", "anexo_iii_mujeres_actual"),
                      ("y1939", "anexo_iv_mujeres_1939")):
        path = THESIS_DIR / f"{name}.csv"
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        by_cat: dict[str, int] = {}
        by_district: dict[str, int] = {}
        for r in rows:
            by_cat[r["categoria"]] = by_cat.get(r["categoria"], 0) + 1
            d = r["distrito"]
            by_district[d] = by_district.get(d, 0) + 1
        out[key] = {"total": len(rows), "by_category": by_cat, "by_district": by_district}
        if key == "current":
            prof: dict[str, int] = {}
            for r in rows:
                if r["profesion"]:
                    prof[r["profesion"]] = prof.get(r["profesion"], 0) + 1
            out[key]["by_profession"] = dict(sorted(prof.items(), key=lambda kv: -kv[1]))
    # The three callejeros the thesis compares longitudinally (figure 97).
    out["series"] = [
        {"year": 1939, "women": 84, "model": {"es": "Advocaciones marianas",
                                              "en": "Marian devotions"}},
        {"year": 1993, "women": 301, "model": {"es": "Mujeres ficticias",
                                               "en": "Fictional women"}},
        {"year": 2022, "women": 482, "model": {"es": "Artes literarias y escénicas",
                                               "en": "Literary and performing arts"}},
    ]
    out["men_2022"] = 2599
    return out


def _bbox(lons: list[float], lats: list[float], q: float = 0.002,
          pad: float = 0.06) -> list[float] | None:
    """Extent of the city, taken from quantiles rather than the extremes.

    Municipal registers carry the occasional stray coordinate -- Málaga's has a
    rural holding recorded some 70km west of the city -- and a bbox drawn from
    the true minimum and maximum would zoom the map out far enough to make the
    city itself a speck. Trimming two per mille from each end removes those
    without cutting into anything real; the strays keep their row and their
    geometry, they simply do not set the frame.
    """
    if not lons:
        return None
    def span(v):
        lo = v[min(int(q * (len(v) - 1)), len(v) - 1)]
        hi = v[max(int((1 - q) * (len(v) - 1)), 0)]
        m = (hi - lo) * pad
        return lo - m, hi + m
    x0, x1 = span(lons)
    y0, y1 = span(lats)
    return [round(x0, 5), round(y0, 5), round(x1, 5), round(y1, 5)]


def _columnar(rows: list[dict]) -> dict:
    """Rows -> one array per field, with the repetitive fields dictionary-coded.

    Every array is parallel and index `i` of each refers to the same vía, so the
    client can rebuild a row without a join. Interned columns become
    `{"dict": [...], "idx": [...]}`; a null value is index -1.
    """
    if not rows:
        return {}
    out: dict[str, object] = {}
    for key in rows[0]:
        if key in ("i", "alt"):
            continue
        values = [r[key] for r in rows]
        if key in INTERNED:
            table, idx = {}, []
            for v in values:
                if v is None:
                    idx.append(-1)
                    continue
                if v not in table:
                    table[v] = len(table)
                idx.append(table[v])
            out[key] = {"dict": list(table), "idx": idx}
        else:
            out[key] = values
    # `alt` is present on a handful of contested names only, so it stays sparse.
    out["alt"] = {str(r["i"]): r["alt"] for r in rows if r["alt"]}
    return out


def build(city_id: str) -> dict:
    started = time.time()
    adapter = get_city(city_id)
    spec = adapter.spec
    print(f"[{city_id}] loading …")
    streets = adapter.streets()
    print(f"[{city_id}] {len(streets):,} vías, {sum(s.mapped for s in streets):,} mapped")

    print(f"[{city_id}] measuring …")
    metrics.compute(streets, spec, _block_edges(city_id))

    print(f"[{city_id}] classifying …")
    clf = Classifier(spec.language)
    for s in streets:
        v = clf.classify(s.name)
        s.designatum = v.as_dict()

    frame = geo.Frame(*spec.centre)
    rows, geometries = [], []
    for s in streets:
        d = s.designatum
        rows.append({
            "i": len(rows),
            "id": s.id,
            "name": s.display or titlecase(deinvert(s.name)),
            "kind": s.kind,
            "kindLabel": s.kind_label,
            "district": s.district,
            "barrio": s.neighbourhood,
            "year": s.year,
            "yearEst": s.year_is_estimate,
            "length": s.length_m,
            "width": s.width_m,
            "distCentre": s.dist_center_m,
            "connections": s.extra.get("connections"),
            "importance": s.importance,
            "centroid": s.centroid,
            "cat": d["category"],
            "sub": d["subcategory"],
            "gender": d["gender"],
            "real": d["realness"],
            "conf": d["confidence"],
            "rule": d["rule"],
            "why": d["evidence"],
            "contested": d["contested"],
            "alt": [{"cat": a["category"], "sub": a["subcategory"],
                     "gender": a["gender"], "why": a["evidence"]}
                    for a in d["alternatives"]] or None,
            "mapped": s.mapped,
        })
        if s.mapped:
            lines = []
            for line in s.lines:
                xy = geo.simplify(frame.xy(line), SIMPLIFY_TOLERANCE_M)
                if len(xy) > 1:
                    lines.append([[round(v, COORD_DP) for v in pt]
                                  for pt in frame.lonlat(xy)])
            if lines:
                geometries.append({"i": rows[-1]["i"], "l": lines})

    columns = _columnar(rows)

    lons = sorted(s.centroid[0] for s in streets if s.centroid)
    lats = sorted(s.centroid[1] for s in streets if s.centroid)
    bundle = {
        "city": {
            "id": spec.id, "name": spec.name, "country": spec.country,
            "language": spec.language, "centre": list(spec.centre),
            "centreLabel": spec.centre_label,
            "bbox": _bbox(lons, lats),
            "attribution": list(spec.attribution),
            "notes": spec.notes,
        },
        "generated": date.today().isoformat(),
        "taxonomy": taxonomy.as_json(),
        "prominence": {"weights": metrics.PROMINENCE_WEIGHTS},
        "thesis": _thesis_reference() if city_id == "malaga" else None,
        "columns": columns,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    main = OUT / f"{city_id}.json"
    geom = OUT / f"{city_id}.geo.json"
    main.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    geom.write_text(json.dumps({"g": geometries}, ensure_ascii=False,
                               separators=(",", ":")), encoding="utf-8")
    print(f"[{city_id}] {main.name} {main.stat().st_size/1e6:.1f} MB, "
          f"{geom.name} {geom.stat().st_size/1e6:.1f} MB "
          f"({time.time() - started:.1f}s)")
    return bundle


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--city", default="malaga", choices=available() + ["all"])
    args = ap.parse_args()
    for city in (available() if args.city == "all" else [args.city]):
        build(city)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
