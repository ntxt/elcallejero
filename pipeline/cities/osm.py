"""Generic OpenStreetMap adapter: any city, no municipal data needed.

This is the portability path. It gives less than a bespoke adapter -- OSM has no
register date, so the age dimension is empty, and administrative districts
depend on what mappers have drawn -- but it turns "support city X" into a
four-line entry in `registry.py`.

Ways are grouped by name, because the unit of analysis is the named vía and OSM
splits one street into many ways at every junction and attribute change. Grouping
is per name and per admin area so that two unrelated Calle Mayor in different
districts are not merged into one implausible street.
"""
from __future__ import annotations

import collections
import json
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from .base import CitySpec, Street

RAW = Path(__file__).resolve().parents[2] / "data" / "raw"
ENDPOINT = "https://overpass-api.de/api/interpreter"

# Service ways and tracks are not part of a city's naming record.
EXCLUDED = "proposed|construction|raceway|bus_guideway|escape"

QUERY = """
[out:json][timeout:180];
area["name"="{name}"]["admin_level"~"^(7|8)$"]->.a;
(
  way(area.a)["highway"]["name"]["highway"!~"{excluded}"];
);
out tags geom;
"""

# OSM's own street-type vocabulary is the highway tag; the Spanish vía type has
# to be read off the front of the name instead.
ES_KINDS = {
    "CALLE": "calle", "AVENIDA": "avenida", "PLAZA": "plaza", "PASEO": "paseo",
    "CAMINO": "camino", "CARRETERA": "carretera", "RONDA": "ronda",
    "PASAJE": "pasaje", "CALLEJON": "callejon", "TRAVESIA": "travesia",
    "GLORIETA": "glorieta", "PLAZUELA": "plazuela", "ALAMEDA": "alameda",
    "BULEVAR": "bulevar", "CUESTA": "subida", "SENDA": "senda",
    "PUENTE": "puente", "PARQUE": "parque", "JARDIN": "jardin",
    "AUTOVIA": "autovia", "CARRIL": "carril", "PASILLO": "pasillo",
}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.upper())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def split_kind(name: str) -> tuple[str, str, str]:
    """('Calle de la Victoria') -> ('calle', 'Calle', 'de la Victoria')."""
    tokens = name.split()
    if tokens:
        head = _fold(tokens[0])
        if head in ES_KINDS:
            rest = " ".join(tokens[1:])
            # "Calle de la Victoria" -> the vía is named Victoria
            words = rest.split()
            while words and _fold(words[0]) in {"DE", "DEL", "LA", "LAS", "LOS", "EL"}:
                words = words[1:]
            return ES_KINDS[head], tokens[0], " ".join(words) or rest
    return "calle", "Calle", name


class OSMCity:
    def __init__(self, spec: CitySpec):
        self.spec = spec

    @property
    def cache(self) -> Path:
        return RAW / self.spec.id / "overpass.json"

    def fetch(self, force: bool = False) -> dict:
        if self.cache.exists() and not force:
            return json.loads(self.cache.read_text(encoding="utf-8"))
        query = QUERY.format(name=self.spec.name, excluded=EXCLUDED)
        data = urllib.parse.urlencode({"data": query}).encode()
        req = urllib.request.Request(
            ENDPOINT, data=data,
            headers={"User-Agent": "callejero-feminista/1.0 (research; street-name analysis)"},
        )
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=300) as resp:
                    payload = json.loads(resp.read().decode())
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(15 * (attempt + 1))
        self.cache.parent.mkdir(parents=True, exist_ok=True)
        self.cache.write_text(json.dumps(payload), encoding="utf-8")
        return payload

    def streets(self) -> list[Street]:
        payload = self.fetch()
        groups: dict[str, list[dict]] = collections.defaultdict(list)
        for el in payload.get("elements", []):
            name = (el.get("tags") or {}).get("name")
            if name and el.get("geometry"):
                groups[name].append(el)

        out = []
        for name, ways in sorted(groups.items()):
            kind, kind_label, bare = split_kind(name)
            lines = [[[p["lon"], p["lat"]] for p in w["geometry"]] for w in ways]
            tags = ways[0].get("tags", {})
            start = tags.get("start_date") or tags.get("name:etymology:date")
            out.append(Street(
                id=f"{self.spec.id}:{ways[0]['id']}",
                name=bare,
                kind=kind,
                kind_label=kind_label,
                lines=lines,
                year=int(start[:4]) if start and start[:4].isdigit() else None,
                extra={
                    "osm_ways": len(ways),
                    "highway": tags.get("highway"),
                    "wikidata": tags.get("name:etymology:wikidata"),
                    "full_name": name,
                },
            ))
        return out
