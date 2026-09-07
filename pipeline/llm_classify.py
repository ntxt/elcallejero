"""Resolve the names the rules could not, with Claude.

The rule cascade in `classify.py` settles roughly seven names in ten. What it
cannot settle is the long tail that needs world knowledge rather than pattern
matching: a bare surname that happens to be a painter, a bullfighter's nickname,
a minor river, a saint written without her title, a local landmark. That is what
this pass is for.

Two properties matter more here than throughput:

  auditable   every label produced is written to `data/sources/llm_labels.json`
              with the model that produced it and its own one-line reason, and
              that file is the artefact the pipeline consumes. Re-running the
              build does not re-run the model, and a label can be corrected by
              hand and will then survive every later build.
  bounded     the model is given the closed taxonomy and asked to answer
              `unknown` rather than guess. A wrong confident label is worse than
              an honest gap, because the gap is visible in the UI and the wrong
              label is not.

Usage
    ANTHROPIC_API_KEY=... python -m pipeline.llm_classify --city malaga
    ANTHROPIC_API_KEY=... python -m pipeline.llm_classify --city malaga --limit 50

Without a key the module still loads: `load_labels()` is what the build calls,
and it only reads the cache.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABELS = ROOT / "data" / "sources" / "llm_labels.json"

MODEL = "claude-opus-4-5"
BATCH = 40

SYSTEM = """You identify what Spanish street names refer to.

You are given street names exactly as they appear in a municipal register, \
folded to uppercase without accents, and stripped of the vía type (calle, plaza, \
avenida). Your job is to say what each name designates.

Answer with the closed vocabulary given below and nothing else.

category / subcategory, pick exactly one pair:
  person      politics military clergy letters performing visual music science
              education health sport bullfighting business nobility exploration
              activism relative journalism law other
  fictional   mythology literature opera folklore other
  religion    marian saint biblical order devotion
  place       municipality region country world_city hydronym oronym local
  landscape   rural_estate hydrography relief built descriptive
  nature      tree flower fruit bird animal sea_life mineral celestial weather
  trade       guild occupation
  culture     music_form artwork vessel sport_club science
  event       battle date historical festivity
  institution civic education labour
  abstract    virtue concept
  unknown     unresolved surname_only

gender, pick exactly one:
  f       a woman, or a female figure, saint, goddess or Marian title
  m       a man, or a male figure, saint or god
  mixed   a family, a couple, or a group of both
  none    the referent has no gender: a place, a plant, an idea
  unknown you cannot tell

Rules you must follow:
- Answer `unknown` / `unresolved` when you do not actually know the referent. \
A gap is useful; a guess is not. Do not infer a person's field from their \
surname, and do not invent biographies.
- Spanish surnames alone, with no forename and no title, are `unknown` / \
`surname_only` unless you positively recognise the person.
- A name that is both a Marian advocation and a common woman's given name \
(Carmen, Rosario, Dolores, Angustias...) is `religion` / `marian` only if a \
devotional word is present; otherwise `unknown` / `unresolved`, because the \
register alone cannot settle it.
- Andalusian rural names (lagar, cortijo, casilla, venta, haza, majada) are \
`landscape` / `rural_estate` whatever follows them.
- `reason` is at most eight words, in Spanish, naming the referent. Not a \
restatement of the category.

Return a JSON array, one object per name, same order, no prose:
[{"name":"...","category":"...","subcategory":"...","gender":"...","reason":"..."}]"""


def load_labels() -> dict[str, dict]:
    if not LABELS.exists():
        return {}
    return json.loads(LABELS.read_text(encoding="utf-8"))


def save_labels(labels: dict[str, dict]) -> None:
    LABELS.parent.mkdir(parents=True, exist_ok=True)
    LABELS.write_text(json.dumps(labels, ensure_ascii=False, indent=1, sort_keys=True),
                      encoding="utf-8")


def pending(city: str) -> list[str]:
    """Names this city still needs a label for, rules and cache both applied."""
    from .classify import Classifier, normalise
    from .registry import get_city


    adapter = get_city(city)
    clf = Classifier(adapter.spec.language)
    have = load_labels()
    out, seen = [], set()
    for street in adapter.streets():
        key = normalise(street.name)
        if not key or key in seen or key in have:
            continue
        v = clf.classify(street.name)
        if v.rule in RESOLVE_RULES:
            seen.add(key)
            out.append(key)
    return out


# Rules whose verdicts the model is allowed to improve on. Defined once, in the
# classifier, so this pass and the classifier's own override logic can never
# drift apart -- they were separate lists, and adding a rule to one silently left
# the other behind.
from .classify import WEAK_RULES as RESOLVE_RULES  # noqa: E402


def classify_batch(client, names: list[str]) -> list[dict]:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM,
        messages=[{"role": "user", "content": "\n".join(names)}],
    )
    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--city", default="malaga")
    ap.add_argument("--limit", type=int, default=0, help="stop after N names")
    args = ap.parse_args()

    todo = pending(args.city)
    if args.limit:
        todo = todo[: args.limit]
    if not todo:
        print("nothing pending")
        return 0
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(f"{len(todo)} names pending, but ANTHROPIC_API_KEY is not set.",
              file=sys.stderr)
        return 1

    import anthropic
    client = anthropic.Anthropic()
    labels = load_labels()
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        for row in classify_batch(client, chunk):
            labels[row["name"]] = {
                "category": row["category"],
                "subcategory": row["subcategory"],
                "gender": row["gender"],
                "reason": row.get("reason", ""),
                "model": MODEL,
            }
        save_labels(labels)
        print(f"  {min(i + BATCH, len(todo))}/{len(todo)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
