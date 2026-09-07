"""Shared text handling for names as they are written, not as they are stored."""
from __future__ import annotations

import re
import unicodedata

# Words a Spanish name keeps in lower case unless they open it.
PARTICLES = {
    "de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al",
    "da", "do", "dos", "das", "van", "von", "der", "di", "du", "des", "le",
}
# Forms that stay upper case: roman numerals and short road codes.
UPPER = re.compile(r"^(?:[IVXLCDM]+|[A-Z]{1,3}[- ]?\d+[A-Z]?|S\.?A\.?)$", re.I)


def titlecase(name: str) -> str:
    """Title-case a Spanish place or person name.

    `str.title()` alone gives "Valle De Abdalajís" and "Ma-3101"; this keeps
    particles down, roman numerals and road codes up, and leaves any casing the
    source already got right alone.
    """
    words = name.split()
    out: list[str] = []
    for i, w in enumerate(words):
        if UPPER.match(w):
            out.append(w.upper())
            continue
        low = w.lower()
        if i > 0 and low in PARTICLES:
            out.append(low)
            continue
        # Keep internal capitals a source may already carry (O'Donnell, McKay).
        out.append(low[:1].upper() + low[1:] if w.isupper() or w.islower()
                   else w[:1].upper() + w[1:])
    return " ".join(out)


def fold(s: str) -> str:
    """Upper case, accents and punctuation stripped: the key form for matching."""
    s = unicodedata.normalize("NFD", str(s).upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    for ch in ".,;:()\"'":
        s = s.replace(ch, " ")
    return " ".join(s.replace("-", " ").split())


ARTICLES = {"LA", "EL", "LAS", "LOS"}


def deinvert(name: str) -> str:
    """Put a register's trailing article back at the front.

    The municipal callejero files streets for alphabetical sorting, so "La
    Adelfilla" is stored as "ADELFILLA DE LA" and "La Minilla" as "MINILLA LA".
    Displayed as filed they read as errors.
    """
    parts = name.split()
    if len(parts) >= 3 and parts[-2].upper() == "DE" and parts[-1].upper() in ARTICLES:
        # "ADELFILLA DE LA" is filed from "Calle de la Adelfilla": the
        # preposition belongs to the vía type, not to the name.
        return " ".join([parts[-1], *parts[:-2]])
    if len(parts) >= 2 and parts[-1].upper() in ARTICLES:
        return " ".join([parts[-1], *parts[:-1]])
    return name
