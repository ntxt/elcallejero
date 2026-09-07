"""Málaga adapter, built on the city's own cartographic callejero.

Source: Ayuntamiento de Málaga open data portal (datosabiertos.malaga.eu),
"Sistema de Información Cartográfica - Callejero", CC-BY 4.0. It is a proper
relational model rather than a flat street list, which is why it is preferred
over OSM here: it carries the official vía type, the official district, and
FECALTA -- the date each name entered the municipal register, which is the only
direct source for the age dimension.

Layers used
    Vial                     one row per named vía (the unit of analysis)
    RelacionTramoVial        vía  <->  segment
    TramoVial                segment geometry
    TipoVial / ClaseVial     code lists
    DistritoMunicipal        the 11 districts the thesis is organised by
    tramos_calle_barrio.csv  authoritative district + barrio per vía code
"""
from __future__ import annotations

import collections
import csv
import json
from pathlib import Path

from .base import CitySpec, Street

RAW = Path(__file__).resolve().parents[2] / "data" / "raw" / "malaga"
ROOT_SOURCES = Path(__file__).resolve().parents[2] / "data" / "sources"

SPEC = CitySpec(
    id="malaga",
    name="Málaga",
    country="ES",
    language="es",
    # Plaza de la Constitución: the historic centre point of the city, and the
    # origin the thesis' own centre-periphery reading is built around.
    centre=(-4.42148, 36.72122),
    centre_label="Plaza de la Constitución",
    attribution=(
        "Callejero: Ayuntamiento de Málaga, datosabiertos.malaga.eu (CC BY 4.0)",
        "Relieve: AWS Terrain Tiles / Mapzen (ODbL)",
        "Base cartográfica: OpenStreetMap contributors (ODbL) vía OpenFreeMap",
    ),
    notes={
        "es": "Vías de tipo «Diseminado» (lagares, cortijos y casillas del suelo "
              "rústico) no tienen geometría en la fuente municipal y no se dibujan "
              "en el mapa, aunque sí se clasifican y cuentan.",
        "en": "Vías typed 'Diseminado' (scattered rural holdings) carry no geometry "
              "in the municipal source and are not drawn on the map, though they "
              "are still classified and counted.",
    },
)

# FECALTA is a register date, not a naming date. Two values are bulk-load
# artefacts rather than real dates and must not be read as such.
SENTINEL_YEARS = {1900}


def _load(name: str) -> list[dict]:
    with (RAW / f"da_cartografia{name}-4326.geojson").open(encoding="utf-8") as fh:
        return json.load(fh)["features"]


def _slug(s: str) -> str:
    table = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    return s.strip().lower().translate(table).replace(" ", "_")


class Malaga:
    spec = SPEC

    def streets(self) -> list[Street]:
        tipos = {f["properties"]["CODTIPVIAL"]: f["properties"]["DESTIPVIAL"]
                 for f in _load("TipoVial")}
        clases = {f["properties"]["CODCLASEVIAL"]: f["properties"]["DESCLASEVIAL"]
                  for f in _load("ClaseVial")}

        geom = {f["properties"]["ID_TRAMOVIAL"]: f["geometry"]
                for f in _load("TramoVial") if f["geometry"]}
        segs: dict[int, list[int]] = collections.defaultdict(list)
        for f in _load("RelacionTramoVial"):
            p = f["properties"]
            segs[p["CODVIAL5"]].append(p["ID_TRAMOVIAL"])

        admin = self._admin()
        display = self._display_names()

        out: list[Street] = []
        for f in _load("Vial"):
            p = f["properties"]
            if p["FECBAJA"]:
                continue                       # vía withdrawn from the register
            code = p["CODVIAL5"]
            lines = []
            for sid in segs.get(code, ()):
                g = geom.get(sid)
                if not g:
                    continue
                if g["type"] == "LineString":
                    lines.append(g["coordinates"])
                elif g["type"] == "MultiLineString":
                    lines.extend(g["coordinates"])

            year = int(p["FECALTA"][:4]) if p.get("FECALTA") else None
            district, barrio = admin.get(code, (None, None))
            kind_label = tipos.get(p["CODTIPVIAL"], "Vía")

            out.append(Street(
                id=f"malaga:{code}",
                name=p["NOMVIAL"].strip(),
                display=display.get(str(code)),
                kind=_slug(kind_label),
                kind_label=kind_label,
                lines=lines,
                district=district,
                neighbourhood=barrio,
                year=year,
                year_is_estimate=year in SENTINEL_YEARS,
                extra={
                    "code": code,
                    "clase": clases.get(p["CODCLASEVIAL"]),
                    "registered": p["FECALTA"][:10] if p.get("FECALTA") else None,
                },
            ))
        return out

    @staticmethod
    def _display_names() -> dict[str, str]:
        """Accented spellings recovered from the cartographic label layer.

        Built by `malaga_names.py`; absent it, names simply fall back to the
        register's own upper-case, unaccented form.
        """
        path = ROOT_SOURCES / "malaga_display_names.json"
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _admin() -> dict[int, tuple[str | None, str | None]]:
        """District and barrio per vía code, from the municipal tramos table.

        A vía can run through more than one barrio; the one carrying the most
        segments wins, which keeps the assignment stable and matches how the
        council itself lists a street.
        """
        counts: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
        dist: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
        path = RAW / "tramos_calle_barrio.csv"
        # The municipal CSV is issued in Latin-1, not UTF-8.
        with path.open(encoding="latin-1", newline="") as fh:
            for row in csv.DictReader(fh):
                code = int(row["CODIGO_CALLE"])
                counts[code][row["BARRIO"].strip().title()] += 1
                dist[code][row["NOM_DISTRITO"].strip().title()] += 1
        return {c: (dist[c].most_common(1)[0][0] if dist[c] else None,
                    counts[c].most_common(1)[0][0] if counts[c] else None)
                for c in counts}
