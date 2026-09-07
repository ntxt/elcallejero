"""Turn the official reference lists into compact lookup tables.

Sources, all public and all national rather than assembled by hand, so the
classifier's judgements about what is a person's name can be audited:

  nombres_por_edad_media.xls  INE, Padrón Continuo 01/01/2022. Every given name
                              borne by 20+ people in Spain, split by sex, with
                              frequency. 27,458 male and 28,304 female entries.
  apellidos_frecuencia.xls    INE, Censo 01/01/2025. Every surname borne by 20+
                              people, with frequency.
  municipios.xlsx             INE, municipal dictionary 01/01/2025. All 8,132
                              Spanish municipalities.

A name appearing in both sex lists is not discarded: the frequencies give a
ratio, and the classifier uses that ratio rather than a bare male/female flag,
so "TRINIDAD" (overwhelmingly female) and "CRUZ" (mixed) are treated differently.
"""
from __future__ import annotations

import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "gazetteers"
OUT = ROOT / "data" / "sources"

MIN_FREQ = 20            # INE's own publication floor
AMBIGUOUS_BAND = (0.15, 0.85)   # female share inside this band counts as unisex


def fold(s: str) -> str:
    """Uppercase, strip accents and punctuation: the key form used everywhere."""
    s = unicodedata.normalize("NFD", str(s).upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.replace("-", " ").replace("'", " ").split())


def _sheet_rows(book, sheet, header_row):
    sh = book.sheet_by_name(sheet)
    for r in range(header_row, sh.nrows):
        yield [sh.cell_value(r, c) for c in range(sh.ncols)]


def build_given_names() -> dict:
    import xlrd
    book = xlrd.open_workbook(RAW / "nombres_por_edad_media.xls")
    counts: dict[str, list[float]] = {}
    for sheet, slot in (("Hombres", 0), ("Mujeres", 1)):
        for row in _sheet_rows(book, sheet, 7):
            name, freq = row[1], row[2]
            if not name or not isinstance(freq, (int, float)) or freq < MIN_FREQ:
                continue
            counts.setdefault(fold(name), [0.0, 0.0])[slot] += float(freq)

    out = {}
    for name, (m, f) in counts.items():
        total = m + f
        if total < MIN_FREQ:
            continue
        share = f / total
        sex = "f" if share >= AMBIGUOUS_BAND[1] else "m" if share <= AMBIGUOUS_BAND[0] else "u"
        out[name] = {"sex": sex, "share_f": round(share, 3), "n": int(total)}
    return out


def build_surnames() -> dict:
    import xlrd
    book = xlrd.open_workbook(RAW / "apellidos_frecuencia.xls")
    out: dict[str, int] = {}
    for sheet in book.sheet_names():
        for row in _sheet_rows(book, sheet, 5):
            name, freq = row[1], row[2]
            if not name or not isinstance(freq, (int, float)):
                continue
            key = fold(name)
            if key:
                out[key] = max(out.get(key, 0), int(freq))
    return out


def build_municipalities() -> list[str]:
    import openpyxl
    sh = openpyxl.load_workbook(RAW / "municipios.xlsx").active
    names = set()
    for row in sh.iter_rows(min_row=3, values_only=True):
        raw = row[4]
        if not raw:
            continue
        # INE writes inverted forms ("Coruña, A") and bilingual pairs ("X/Y").
        text = str(raw)
        if "," in text:
            head, tail = text.split(",", 1)
            text = f"{tail.strip()} {head.strip()}"
        for part in text.split("/"):
            key = fold(part)
            if len(key) > 2:
                names.add(key)
    return sorted(names)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    given = build_given_names()
    surnames = build_surnames()
    municipalities = build_municipalities()
    for name, obj in (("given_names_ine", given),
                      ("surnames_ine", surnames),
                      ("municipalities_ine", municipalities)):
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        print(f"{path.name}: {len(obj):,} entries")
    fem = sum(1 for v in given.values() if v["sex"] == "f")
    masc = sum(1 for v in given.values() if v["sex"] == "m")
    print(f"  given names -> {fem:,} female, {masc:,} male, "
          f"{len(given) - fem - masc:,} unisex")


if __name__ == "__main__":
    main()
