"""Recover the accented spelling of every Málaga vía.

The `Vial` table stores names as the register keeps them -- upper case, no
accents -- so "MARIA ZAMBRANO" is what a naive build would show. The cartographic
label layer (`ToponimiaVial`) carries the same names as they are actually drawn
on the map, accents and all, keyed by the same vía code. This module joins the
two and writes a small code -> display-name table.

Labels are stored as they are typeset: broken across lines, sometimes padded
with spaces for centring, and usually prefixed with the vía type, either
abbreviated ("PL MARÍA DEL CARMEN…") or spelled out ("PLAZA MARÍA…"). A label is
accepted only if, once the whitespace is collapsed and any leading type word is
removed, it folds to exactly the register spelling -- so a mis-joined or
truncated label can never silently rename a street.

    python -m pipeline.cities.malaga_names
"""
from __future__ import annotations

import collections
import json
import re
from pathlib import Path

from ..text import fold, titlecase

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "malaga"
OUT = ROOT / "data" / "sources" / "malaga_display_names.json"

# Every abbreviation and full form the label layer uses to open a name.
TYPE_WORDS = {
    "AL", "ALMD", "ALAMEDA", "AV", "AVDA", "AVENIDA", "BL", "BULEVAR",
    "CJ", "CJON", "CALLEJON", "CL", "CALLE", "CM", "CAMINO", "CR", "CARRIL",
    "CA", "CARRERA", "CT", "CTRA", "CARRETERA", "DS", "DISEMINADO",
    "GR", "GRUPO", "GL", "GLORIETA", "PJ", "PJE", "PASAJE", "PZ", "PL", "PLAZA",
    "PZA", "PLAZUELA", "PS", "PASILLO", "PT", "PUENTE", "PQ", "PARQUE",
    "PO", "PASEO", "SB", "SUBIDA", "SD", "SENDA", "TR", "TRAVESIA", "JD",
    "JARDIN", "AU", "AUTOVIA", "URB", "URBANIZACION", "BDA", "BARRIADA",
}


def _candidates(text: str) -> list[str]:
    """A label, cleaned, with and without its leading vía-type word(s)."""
    flat = " ".join(str(text).replace("\n", " ").split())
    out = [flat]
    parts = flat.split()
    for take in (1, 2):
        if len(parts) > take and all(fold(p) in TYPE_WORDS for p in parts[:take]):
            out.append(" ".join(parts[take:]))
    return out


def build() -> dict[str, str]:
    labels = collections.defaultdict(list)
    with (RAW / "da_cartografiaToponimiaVial-4326.geojson").open(encoding="utf-8") as fh:
        for feature in json.load(fh)["features"]:
            p = feature["properties"]
            if p.get("TEXTO"):
                labels[p["CODVIAL5"]].append(p["TEXTO"])

    with (RAW / "da_cartografiaVial-4326.geojson").open(encoding="utf-8") as fh:
        vials = [f["properties"] for f in json.load(fh)["features"]]

    out: dict[str, str] = {}
    for v in vials:
        if v["FECBAJA"]:
            continue
        want = fold(v["NOMVIAL"])
        for text in labels.get(v["CODVIAL5"], ()):
            for cand in _candidates(text):
                if fold(cand) == want and re.search(r"[A-Za-zÁÉÍÓÚÜÑ]", cand):
                    out[str(v["CODVIAL5"])] = titlecase(cand)
                    break
            if str(v["CODVIAL5"]) in out:
                break
    return out


def main() -> None:
    names = build()
    OUT.write_text(json.dumps(names, ensure_ascii=False, sort_keys=True,
                              separators=(",", ":")), encoding="utf-8")
    accented = sum(1 for n in names.values() if fold(n) != n.upper())
    print(f"{OUT.name}: {len(names):,} names, {accented:,} carry accents")


if __name__ == "__main__":
    main()
