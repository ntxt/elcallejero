"""The set of cities the platform knows how to build.

Adding a city means adding one entry here. If its council publishes a
cartographic callejero, write an adapter like `cities/malaga.py` and get the
official vía types, districts and register dates. If it does not, point the
generic OSM adapter at it and get a working city from OpenStreetMap alone.
"""
from __future__ import annotations

from .cities.base import Adapter, CitySpec
from .cities.malaga import Malaga
from .cities.osm import OSMCity

# Cities with a bespoke adapter over an official municipal source.
NATIVE: dict[str, type] = {
    "malaga": Malaga,
}

# Cities served by the generic OpenStreetMap adapter. Everything here is data,
# not code: a new city is four lines.
OSM: dict[str, CitySpec] = {
    "granada": CitySpec(
        id="granada", name="Granada", country="ES", language="es",
        centre=(-3.59944, 37.17667), centre_label="Plaza Nueva",
        attribution=("OpenStreetMap contributors (ODbL)",),
    ),
    "sevilla": CitySpec(
        id="sevilla", name="Sevilla", country="ES", language="es",
        centre=(-5.99417, 37.38917), centre_label="Plaza Nueva",
        attribution=("OpenStreetMap contributors (ODbL)",),
    ),
    "cadiz": CitySpec(
        id="cadiz", name="Cádiz", country="ES", language="es",
        centre=(-6.29889, 36.52944), centre_label="Plaza San Juan de Dios",
        attribution=("OpenStreetMap contributors (ODbL)",),
    ),
}


def available() -> list[str]:
    return sorted({*NATIVE, *OSM})


def get_city(city_id: str) -> Adapter:
    if city_id in NATIVE:
        return NATIVE[city_id]()
    if city_id in OSM:
        return OSMCity(OSM[city_id])
    raise KeyError(f"unknown city {city_id!r}; known: {', '.join(available())}")
