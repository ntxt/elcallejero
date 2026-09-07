"""Extract the structured annexes from Linares Rodríguez (2024).

`LA INVISIBILIDAD DE LAS MUJERES EN EL CALLEJERO MALAGUEÑO`
Universidad de Granada, ISBN 978-84-1195-115-9, https://hdl.handle.net/10481/88267

Two tables are recovered:

  Anexo III (pp. 442-465 physical)  every woman-named vía in the 2022 callejero,
                                    with district, vía type, profession, toponym
                                    type and first-level category.
  Anexo IV  (pp. 466-468 physical)  the women present in the first official
                                    callejero of 1939.

The PDF is a copy-protected iText render with no tagged table structure, so the
tables are rebuilt from word bounding boxes: columns are recovered from the
x-origin of the header cells (content is left-aligned to them) and rows from the
vertical gap between text lines -- inside a row wrapped lines sit 4.2/8.4pt
apart, between rows the gap is never below 11pt.
"""
from __future__ import annotations

import csv
import re
import subprocess
import unicodedata
from dataclasses import dataclass, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "las_mujeres_en_el_callejero_malagueño_linares.pdf"
OUT = ROOT / "data" / "sources"

ANEXO_III_PAGES = (442, 465)
ANEXO_IV_PAGES = (466, 468)

# Row separation: wrapped lines within one row are <=8.4pt apart, the gap
# between rows is never below 11.4pt except for two hand-measured rows at 9.9
# and 10.2, so the split sits in the middle of that empty valley.
ROW_GAP = 9.0
# Same text line tolerance.
LINE_TOL = 1.5

WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>'
)
ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}


@dataclass(frozen=True)
class Word:
    x: float
    y: float
    x1: float
    y1: float
    text: str


def _unescape(s: str) -> str:
    for k, v in ENTITIES.items():
        s = s.replace(k, v)
    return s


def page_words(pdf: Path, page: int) -> list[Word]:
    xml = subprocess.run(
        ["pdftotext", "-f", str(page), "-l", str(page), "-bbox-layout", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout
    seen, words = set(), []
    for x, y, x1, y1, t in WORD_RE.findall(xml):
        t = _unescape(t).strip()
        if not t:
            continue
        key = (round(float(x), 1), round(float(y), 1), t)
        if key in seen:          # rotated sidebar text is emitted twice
            continue
        seen.add(key)
        words.append(Word(float(x), float(y), float(x1), float(y1), t))
    return words


def _lines(words: list[Word]) -> list[list[Word]]:
    """Group words into text lines by y, each line sorted left to right."""
    out: list[list[Word]] = []
    for w in sorted(words, key=lambda w: (w.y, w.x)):
        if out and abs(w.y - out[-1][0].y) <= LINE_TOL:
            out[-1].append(w)
        else:
            out.append([w])
    for ln in out:
        ln.sort(key=lambda w: w.x)
    return out


def _columns(lines: list[list[Word]], headers: list[str]) -> tuple[list[float], float]:
    """Find the header line and return each column's x-origin plus its y.

    `headers` gives the first word of each column heading, in order.
    """
    for ln in lines:
        toks = [w.text.rstrip(".,").upper() for w in ln]
        norm = ["".join(c for c in unicodedata.normalize("NFD", t)
                        if unicodedata.category(c) != "Mn") for t in toks]
        idx, origins = 0, []
        for i, tok in enumerate(norm):
            if idx < len(headers) and tok == headers[idx]:
                origins.append(ln[i].x)
                idx += 1
        if idx == len(headers):
            return origins, ln[0].y
    raise LookupError(f"header {headers} not found on page")


def _in_table(words: list[Word], origins: list[float]) -> list[Word]:
    """Drop the page furniture that surrounds the table.

    Every page carries a rotated "8. ANEXOS" running head plus a folio number in
    one of the margins, and the margin swaps side on odd and even pages. Left
    margin furniture would otherwise land in the district column and -- worse --
    its text lines bridge the vertical gap between two table rows and silently
    merge them, so it has to go before the lines are grouped rather than after.

    The running head is set rotated, which pdftotext reports as a tall narrow
    box: a body word is 9.1pt high whatever its length, a rotated one is as tall
    as the word is long. Detect it by that aspect ratio, then discard everything
    else sharing its margin -- that also takes the folio and the "8." section
    number, which are upright and so not detectable on their own. The ratio has
    to be decisive (>=2) or the larger type of the table's own heading, and the
    "III" of the annex title, would be mistaken for rotated text.
    """
    bands = [(w.x - 3.0, w.x1 + 3.0) for w in words
             if len(w.text) > 2
             and (w.y1 - w.y) > 15.0
             and (w.y1 - w.y) >= 2.0 * (w.x1 - w.x)]
    left = origins[0] - 6.0

    def keep(w: Word) -> bool:
        if w.x < left:
            return False
        return not any(lo <= w.x <= hi for lo, hi in bands)

    return [w for w in words if keep(w)]


def _cells(lines: list[list[Word]], origins: list[float]) -> list[list[str]]:
    """Split rows on vertical gaps, then bucket each word into its column."""
    rows, prev_y = [], None
    for ln in lines:
        cells = [[] for _ in origins]
        placed = False
        for w in ln:
            col = 0
            for i, ox in enumerate(origins):
                if w.x >= ox - 2.0:
                    col = i
            cells[col].append(w.text)
            placed = True
        if not placed:
            continue
        if prev_y is None or ln[0].y - prev_y >= ROW_GAP:
            rows.append([list(c) for c in cells])
        else:
            for i, c in enumerate(cells):
                rows[-1][i].extend(c)
        prev_y = ln[0].y
    return [[" ".join(c).strip() for c in row] for row in rows]


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def extract_table(pages: tuple[int, int], headers: list[str], ncols: int) -> list[list[str]]:
    rows: list[list[str]] = []
    for page in range(pages[0], pages[1] + 1):
        words = page_words(PDF, page)
        origins, header_y = _columns(_lines(words), headers)
        lines = _lines(_in_table(words, origins))
        body = [ln for ln in lines if ln[0].y > header_y + 2]
        for row in _cells(body, origins):
            row = [_clean(c) for c in row]
            if not any(row):
                continue
            joined = " ".join(row).strip()
            if re.fullmatch(r"8\.|\d{3}", joined):
                continue                      # folio / running-head remnant
            rows.append(row[:ncols])
    return rows


# --- Anexo III -------------------------------------------------------------

III_HEADERS = ["DIS", "TIPO", "NOMBRE", "PROFESION", "TOPONIMO", "1º"]
IV_HEADERS = ["DIS", "TIPO", "NOMBRE", "1º"]

# The thesis' own first-level categories, kept verbatim as `categoria`.
CATEGORIES = {
    "mujer real", "mujer ficticia", "gremio mujeres",
    "nombre genérico de mujer", "mujer desconocida",
}


def _district(cell: str) -> int | None:
    m = re.match(r"(\d{1,2})", cell.replace("º", ""))
    return int(m.group(1)) if m else None


def anexo_iii() -> list[dict]:
    rows = extract_table(ANEXO_III_PAGES, III_HEADERS, 6)
    out = []
    for dis, tipo, nombre, prof, topo, cat in rows:
        if not nombre:
            continue
        out.append({
            "distrito": _district(dis),
            "tipo_via": tipo.lower(),
            "nombre_via": nombre,
            "profesion": prof.lower(),
            "toponimo": topo.lower(),
            "categoria": cat.lower(),
        })
    return out


def anexo_iv() -> list[dict]:
    rows = extract_table(ANEXO_IV_PAGES, IV_HEADERS, 4)
    out = []
    for dis, tipo, nombre, cat in rows:
        if not nombre:
            continue
        out.append({
            "distrito": _district(dis),
            "tipo_via": tipo.lower(),
            "nombre_via": nombre,
            "categoria": cat.lower(),
        })
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in (("anexo_iii_mujeres_actual", anexo_iii()),
                       ("anexo_iv_mujeres_1939", anexo_iv())):
        path = OUT / f"{name}.csv"
        # lineterminator: csv defaults to CRLF, which only creates churn in git.
        with path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()),
                               lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
        print(f"{path.name}: {len(rows)} rows")


if __name__ == "__main__":
    main()
