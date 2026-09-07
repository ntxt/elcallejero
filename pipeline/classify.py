"""Decide what a street name designates.

A cascade of rules, each cheap and each auditable. Every verdict records the
rule that produced it and the evidence it matched on, so any figure the platform
reports can be traced back to a reason rather than to a black box.

Order matters, and it runs from most to least authoritative:

  1 thesis      Linares Rodríguez' own hand-checked list of the 482 women in the
                Málaga callejero -- the gold standard, and the only rule allowed
                to overrule any other
  2 role        a gender-marked title opens the name (ESCRITORA, ALCALDE, SOR)
  3 head        a classifying word opens the name (LAGAR, RIO, VIRGEN, SANTA)
  4 term        the whole name is a thing (NARANJO, BULERIAS, CURTIDORES)
  5 myth        the whole name is a mythological figure
  6 place       the whole name is a place, INE's municipality list included
  7 person      given name from INE's register, optionally with known surnames
  8 given_only  a bare given name, which in a Spanish callejero is genuinely
                ambiguous between a woman and a Marian advocation

Anything left is `unknown` and goes to the LLM pass in `llm_classify.py`.

The Marian collision is never resolved silently. CARMEN, ROSARIO, DOLORES and
some sixty more are at once the commonest women's names in Spain and the
commonest titles of the Virgin, and which reading you take decides whether a
city looks like it honours women or honours devotion. Where the thesis has
ruled, its ruling stands; otherwise the name is marked `contested` and carries
both readings, so the UI can show the count with and without them.
"""
from __future__ import annotations

import csv
import json
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEX = Path(__file__).resolve().parent / "lexicon"
SOURCES = ROOT / "data" / "sources"

PARTICLES = {"DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "DA", "DOS", "DE LA"}
ARTICLES = {"LA", "EL", "LAS", "LOS"}
# INE lists most compounds ("MARIA CARMEN"), but the callejero writes them with
# the preposition ("MARIA DEL CARMEN"), so particles are dropped before lookup.
MAX_GIVEN_TOKENS = 3


def singular(key: str) -> str | None:
    """Crude Spanish de-pluralisation, enough to match a lexicon entry.

    The callejero names things in the plural as readily as the singular -- Calle
    Gardenias next to Calle Gardenia -- and carrying both forms in the lexicon
    would double it for no gain.
    """
    if key.endswith("ES") and len(key) > 4:
        return key[:-2]
    if key.endswith("S") and len(key) > 3:
        return key[:-1]
    return None


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s).upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    for ch in ".,;:()\"'":
        s = s.replace(ch, " ")
    return " ".join(s.replace("-", " ").split())


def normalise(name: str) -> str:
    """Undo the register's inverted article and drop a leading one.

    The municipal callejero files a street as "FERRERIA DE LA" or "MINILLA LA",
    which is "La Ferrería" and "La Minilla" written for alphabetical sorting.
    """
    t = fold(name).split()
    if len(t) >= 3 and t[-2] == "DE" and t[-1] in ARTICLES:
        t = t[:-2]
    elif len(t) >= 2 and t[-1] in ARTICLES:
        t = t[:-1]
    if t and t[0] in ARTICLES:
        t = t[1:]
    return " ".join(t)


@dataclass
class Verdict:
    category: str = "unknown"
    subcategory: str = "unresolved"
    gender: str = "unknown"
    realness: str = "unknown"
    confidence: float = 0.0
    rule: str = "none"
    evidence: str = ""
    contested: bool = False
    alternatives: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


REALNESS_BY_CATEGORY = {
    "person": "real", "fictional": "fictional", "religion": "fictional",
    "place": "n/a", "landscape": "n/a", "nature": "n/a", "trade": "n/a",
    "culture": "n/a", "event": "n/a", "institution": "n/a", "abstract": "n/a",
    "unknown": "unknown",
}
# Saints and biblical figures were, or are held to have been, people; Marian
# advocations and devotions are titles rather than lives. The thesis draws the
# same line, counting advocations as `mujer ficticia`.
REALNESS_BY_SUB = {"saint": "real", "biblical": "real", "order": "n/a"}

# Verdicts weak enough that a model label is allowed to replace them.
WEAK_RULES = {"none", "surname_only", "given_only"}


def _realness(cat: str, sub: str) -> str:
    return REALNESS_BY_SUB.get(sub, REALNESS_BY_CATEGORY.get(cat, "unknown"))


def _gender_for(cat: str, g: str | None) -> str:
    if g in {"f", "m", "mixed"}:
        return g
    if g == "u":
        return "unknown"
    from .taxonomy import CATEGORIES
    return "unknown" if CATEGORIES.get(cat, {}).get("gendered") else "none"


class Classifier:
    def __init__(self, language: str = "es"):
        base = LEX / language
        self.roles = self._load(base / "roles.json")
        self.heads = self._load(base / "heads.json")
        self.terms = self._load(base / "terms.json")
        self.myth = self._load(base / "myth.json")
        marian = json.loads((base / "marian.json").read_text(encoding="utf-8"))
        self.marian = set(marian["advocations"])
        self.devotional = set(marian["devotional_context"])
        places = json.loads((base / "places.json").read_text(encoding="utf-8"))
        self.places = {sub: set(v) for sub, v in places.items() if sub != "_doc"}
        self.given = json.loads((SOURCES / "given_names_ine.json").read_text(encoding="utf-8"))
        self.surnames = set(json.loads((SOURCES / "surnames_ine.json").read_text(encoding="utf-8")))
        self.municipalities = set(json.loads(
            (SOURCES / "municipalities_ine.json").read_text(encoding="utf-8")))
        self.thesis = self._load_thesis()
        self.llm = self._load_llm()

    @staticmethod
    def _load(path: Path) -> dict:
        d = json.loads(path.read_text(encoding="utf-8"))
        d.pop("_doc", None)
        return d

    @staticmethod
    def _load_llm() -> dict[str, dict]:
        """Cached model labels for the tail the rules cannot reach.

        Read-only here: the build never calls a model. See `llm_classify.py`.
        """
        path = SOURCES / "llm_labels.json"
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _load_thesis() -> dict[str, dict]:
        path = SOURCES / "anexo_iii_mujeres_actual.csv"
        if not path.exists():
            return {}
        out = {}
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                out[normalise(row["nombre_via"])] = row
        return out

    # --- rules ---------------------------------------------------------

    def _from_thesis(self, key: str) -> Verdict | None:
        row = self.thesis.get(key)
        if not row:
            return None
        cat, sub = THESIS_MAP.get((row["categoria"], row["toponimo"]),
                                  THESIS_MAP.get((row["categoria"], ""), ("unknown", "unresolved")))
        sub = PROFESSION_MAP.get(row["profesion"], sub) if cat == "person" else sub
        return Verdict(
            category=cat, subcategory=sub, gender="f",
            realness={"mujer real": "real", "mujer ficticia": "fictional",
                      "mujer desconocida": "unknown"}.get(row["categoria"], "n/a"),
            confidence=1.0, rule="thesis",
            evidence=f"Anexo III: {row['categoria']}"
                     + (f" / {row['toponimo']}" if row["toponimo"] else "")
                     + (f" / {row['profesion']}" if row["profesion"] else ""),
        )

    def _from_role(self, tokens: list[str]) -> Verdict | None:
        if not tokens:
            return None
        # "NUESTRA SENORA DE ..." is a two-word title.
        if tokens[0] == "NUESTRA":
            return Verdict("religion", "marian", "f", "fictional", 0.95,
                           "role", "Nuestra Señora")
        hit = self.roles.get(tokens[0])
        if not hit:
            return None
        rest = tokens[1:]
        if not rest:
            return None            # the bare title is not a dedication to anyone
        gender = _gender_for(hit["cat"], hit.get("g"))
        evidence = f"título «{tokens[0].title()}»"
        if gender == "unknown":
            # An unmarked title (pianista, golfista, periodista) says nothing
            # about gender, so read it off the given name that follows. Without
            # this every woman commemorated under an epicene title would fall
            # out of the count.
            given, _ = self._split_given(rest)
            if given and (sex := self.given[given]["sex"]) in {"f", "m"}:
                gender = sex
                evidence += f" + nombre «{given.title()}»"
        return Verdict(hit["cat"], hit["sub"], gender,
                       _realness(hit["cat"], hit["sub"]), 0.92, "role", evidence)

    def _from_head(self, tokens: list[str]) -> Verdict | None:
        if not tokens:
            return None
        hit = self.heads.get(tokens[0])
        if not hit or len(tokens) < 2:
            return None
        return Verdict(hit["cat"], hit["sub"], _gender_for(hit["cat"], hit.get("g")),
                       _realness(hit["cat"], hit["sub"]), 0.85, "head",
                       f"encabezado «{tokens[0].title()}»")

    def _from_term(self, key: str) -> Verdict | None:
        hit = self.terms.get(key)
        if not hit and (sg := singular(key)):
            hit = self.terms.get(sg)
        if not hit:
            return None
        return Verdict(hit["cat"], hit["sub"], _gender_for(hit["cat"], hit.get("g")),
                       _realness(hit["cat"], hit["sub"]), 0.85, "term", key.title())

    def _from_myth(self, key: str) -> Verdict | None:
        g = self.myth.get(key)
        if not g and (sg := singular(key)):
            g = self.myth.get(sg)
        if not g:
            return None
        return Verdict("fictional", "mythology", g, "fictional", 0.9, "myth", key.title())

    def _from_place(self, key: str) -> Verdict | None:
        for sub, names in self.places.items():
            if key in names:
                return Verdict("place", sub, "none", "n/a", 0.88, "place", key.title())
        if key in self.municipalities:
            return Verdict("place", "municipality", "none", "n/a", 0.8,
                           "place", f"municipio INE: {key.title()}")
        return None

    def _split_given(self, tokens: list[str]) -> tuple[str | None, list[str]]:
        """Longest leading run of tokens that INE records as a given name."""
        core = [t for t in tokens if t not in PARTICLES]
        for n in range(min(MAX_GIVEN_TOKENS, len(core)), 0, -1):
            cand = " ".join(core[:n])
            if cand in self.given:
                # consume the matching tokens from the original sequence
                used, seen = 0, 0
                for i, t in enumerate(tokens):
                    if t not in PARTICLES:
                        seen += 1
                    if seen == n:
                        used = i + 1
                        break
                return cand, tokens[used:]
        return None, tokens

    def _from_person(self, tokens: list[str]) -> Verdict | None:
        given, rest = self._split_given(tokens)
        if not given:
            return None
        info = self.given[given]
        gender = {"f": "f", "m": "m"}.get(info["sex"], "unknown")
        rest_core = [t for t in rest if t not in PARTICLES]
        known = [t for t in rest_core if t in self.surnames]
        if not rest_core and len(tokens) < 2:
            return None            # bare given name: handled by _from_given_only
        # A multi-token name INE records whole ("Simón Bolívar", "José María")
        # is still a person even though nothing is left over to be a surname.
        conf = 0.9 if known else 0.8 if not rest_core else 0.7
        return Verdict("person", "other", gender, "real", conf, "person",
                       f"nombre INE «{given.title()}»"
                       + (f" + apellido «{known[0].title()}»" if known else ""))

    def _from_surname_only(self, key: str) -> Verdict | None:
        """A bare surname: someone is commemorated, but the name alone cannot say who.

        The thesis files these as `desconocida` and they are a finding in their
        own right -- a surname with no forename is overwhelmingly a man, since
        women were rarely commemorated by surname alone, but that is an
        inference rather than evidence, so the gender is left undetermined and
        the LLM pass is given the chance to identify the person.
        """
        if key not in self.surnames or key in self.given:
            return None
        return Verdict("unknown", "surname_only", "unknown", "unknown", 0.4,
                       "surname_only", f"apellido INE «{key.title()}», sin nombre")

    def _from_given_only(self, key: str) -> Verdict | None:
        info = self.given.get(key)
        if not info:
            return None
        gender = {"f": "f", "m": "m"}.get(info["sex"], "unknown")
        return Verdict("person", "other", gender, "unknown", 0.45, "given_only",
                       f"nombre de pila «{key.title()}», sin apellido")

    # --- entry point ---------------------------------------------------

    def classify(self, name: str) -> Verdict:
        key = normalise(name)
        tokens = key.split()
        if not tokens:
            return Verdict(evidence="nombre vacío")

        thesis = self._from_thesis(key)
        if thesis:
            return thesis

        marian = self._marian_reading(key, tokens)

        for rule in (lambda: self._from_role(tokens),
                     lambda: self._from_head(tokens),
                     lambda: self._from_term(key),
                     lambda: self._from_myth(key),
                     lambda: self._from_place(key),
                     lambda: self._from_person(tokens),
                     lambda: self._from_given_only(key),
                     lambda: self._from_surname_only(key)):
            v = rule()
            if v:
                break
        else:
            v = Verdict(evidence=name)
        if v.rule in WEAK_RULES:
            v = self._from_llm(key) or v
        return self._merge_marian(v, marian)

    def _from_llm(self, key: str) -> Verdict | None:
        row = self.llm.get(key)
        if not row:
            return None
        cat, sub = row["category"], row["subcategory"]
        if cat == "unknown":
            return None            # the model declined; keep the rule's verdict
        return Verdict(cat, sub, _gender_for(cat, row.get("gender")),
                       _realness(cat, sub), 0.75, "llm", row.get("reason", ""))

    def _marian_reading(self, key: str, tokens: list[str]) -> Verdict | None:
        if key not in self.marian:
            return None
        return Verdict("religion", "marian", "f", "fictional", 0.6, "marian",
                       f"advocación mariana «{key.title()}»")

    @staticmethod
    def _merge_marian(v: Verdict, marian: Verdict | None) -> Verdict:
        """Attach the Marian reading of a name that also reads as something else."""
        if marian is None:
            return v
        if v.rule in {"none", "given_only"}:
            marian.alternatives = [v.as_dict()] if v.rule != "none" else []
            marian.contested = bool(marian.alternatives)
            return marian
        if v.category == "religion":
            return v
        v.alternatives = [marian.as_dict()]
        v.contested = True
        return v


# The thesis' own scheme, mapped onto the taxonomy. Its `toponimo` column is
# finer than its `1º CAT.` column and is used where present.
THESIS_MAP = {
    ("mujer real", "antropónimo"): ("person", "other"),
    ("mujer real", "patronímico"): ("person", "other"),
    ("mujer real", "hipocorísticos apodos o pseudónimos"): ("person", "other"),
    ("mujer real", "santas y religiosas"): ("religion", "saint"),
    ("mujer real", ""): ("person", "other"),
    ("mujer ficticia", "advocación mariana o insti. religiosas"): ("religion", "marian"),
    ("mujer ficticia", "teónimos y mitología"): ("fictional", "mythology"),
    ("mujer ficticia", "personaje de ficción"): ("fictional", "literature"),
    ("mujer ficticia", ""): ("fictional", "other"),
    ("gremio mujeres", ""): ("trade", "guild"),
    ("mujer desconocida", ""): ("unknown", "surname_only"),
}

# The thesis records a dedication for each woman; those map onto our person
# subcategories, which is how the demo gets an occupational breakdown for women
# that is sourced rather than guessed.
PROFESSION_MAP = {
    "artes literarias": "letters", "artes escénicas": "performing",
    "artes visuales": "visual", "música": "music", "ciencias": "science",
    "educación": "education", "medicina": "health", "sanidad": "health",
    "deporte": "sport", "nobleza": "nobility", "política": "politics",
    "religiosa": "clergy", "santa": "clergy", "empresaria": "business",
    "esposa/madre/ hija de": "relative", "esposa de": "relative",
    "madre de": "relative", "hija de": "relative", "periodismo": "journalism",
    "activista": "activism", "flamenco": "music", "cantaora": "music",
}
