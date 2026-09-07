"""City-independent street model and the adapter contract.

An adapter's only job is to turn one city's sources into `Street` records with
raw geometry attached. Everything downstream -- the metrics in `metrics.py`, the
classifier in `classify.py`, the bundle writer in `build.py` -- works purely off
this shape, so supporting a new city means writing one adapter and nothing else.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Street:
    """One named public way, aggregated across all of its segments."""

    id: str
    name: str                       # bare name, the string that gets classified
    kind: str                       # via type slug: calle, avenida, plaza ...
    kind_label: str                 # human label in the city's language
    display: str | None = None      # the name as the city itself writes it
    lines: list[list[list[float]]] = field(default_factory=list)   # [[ [lon,lat], ... ], ...]
    district: str | None = None
    neighbourhood: str | None = None
    year: int | None = None         # year the name entered the official register
    year_is_estimate: bool = False
    # filled in by metrics.py
    length_m: float = 0.0
    width_m: float | None = None
    dist_center_m: float | None = None
    centroid: list[float] | None = None
    importance: float = 0.0
    # filled in by classify.py
    designatum: dict | None = None
    extra: dict = field(default_factory=dict)

    @property
    def mapped(self) -> bool:
        return bool(self.lines)


@dataclass(frozen=True)
class CitySpec:
    """Everything the platform needs to know about a city up front."""

    id: str
    name: str
    country: str
    language: str                   # ISO code of the language street names are in
    centre: tuple[float, float]     # lon, lat of the point distances are measured from
    centre_label: str               # what that point is, shown in the UI
    bbox: tuple[float, float, float, float] | None = None
    attribution: tuple[str, ...] = ()
    notes: dict[str, str] = field(default_factory=dict)


class Adapter(Protocol):
    spec: CitySpec

    def streets(self) -> list[Street]:
        ...
