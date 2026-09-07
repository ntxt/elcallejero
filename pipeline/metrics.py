"""Measure every comparison dimension from geometry alone.

The dimensions are deliberately all derived from the city's own cartography, so
they mean the same thing in every city an adapter is written for:

    length          total centreline length of the vía, all segments summed
    width           corridor width, measured between the facing built blocks
    connections     how many other vías touch it -- its degree in the street graph
    dist_center     straight-line distance from the vía's midpoint to the centre
    prominence      a transparent blend of the four above

`prominence` is what the UI calls "importance". It is a mean of percentile ranks
rather than of raw values so that no single wide-ranging quantity (length spans
four orders of magnitude) can dominate the others.
"""
from __future__ import annotations

import collections
import math

import numpy as np

from . import geo
from .cities.base import CitySpec, Street

SAMPLE_STEP_M = 15.0        # spacing of width probes along a street
MAX_HALF_WIDTH_M = 40.0     # beyond this the nearest block does not face this vía
PARALLEL_MIN = 0.45         # |cos| between block edge and axis, rejects corners
JUNCTION_TOL_M = 6.0        # two vías touching within this share a junction

# How much of a vía's prominence each ingredient accounts for.
PROMINENCE_WEIGHTS = {"length": 0.30, "width": 0.25, "connections": 0.25, "kind": 0.20}

# Prestige of the vía type itself, on the 0-1 scale the other ingredients use.
# A city's own vocabulary of street types encodes a hierarchy; this is Málaga's
# and any adapter may override it.
KIND_RANK = {
    "autovia": 1.00, "avenida": 0.95, "paseo": 0.90, "alameda": 0.90,
    "bulevar": 0.90, "carretera": 0.80, "ronda": 0.80, "parque": 0.75,
    "glorieta": 0.70, "plaza": 0.70, "puente": 0.65, "calle": 0.55,
    "carrera": 0.55, "camino": 0.50, "pasillo": 0.45, "plazuela": 0.45,
    "jardin": 0.40, "travesia": 0.35, "carril": 0.35, "subida": 0.30,
    "senda": 0.30, "grupo": 0.30, "pasaje": 0.25, "callejon": 0.20,
    "diseminado": 0.10,
}
DEFAULT_KIND_RANK = 0.5


def _flat(streets: list[Street], frame: geo.Frame):
    """Project every street once; returns per-street list of (N,2) arrays."""
    return [[frame.xy(line) for line in s.lines if len(line) > 1] for s in streets]


def _edge_index(edges: list[list[list[float]]], frame: geo.Frame):
    a_list, b_list = [], []
    for line in edges:
        xy = frame.xy(line)
        if len(xy) < 2:
            continue
        a_list.append(xy[:-1])
        b_list.append(xy[1:])
    a = np.concatenate(a_list)
    b = np.concatenate(b_list)
    return geo.SegmentIndex(a, b, cell=30.0), a, b


def measure_widths(streets, parts, edges, frame) -> None:
    """Corridor width: the distance between the built blocks facing a vía.

    Measured against block outlines rather than kerb lines on purpose. The kerb
    layer marks every paved edge, so on a dual carriageway the nearest edge
    either side of the axis is the central median and the street reads as three
    metres wide; block outlines bound the whole public corridor and give the
    figure that actually matters here -- how much of the city the street takes up,
    pavements, medians and all. It also stays meaningful for pedestrian streets,
    where there is no carriageway to measure.

    At each probe the nearest block edge on each side of the axis is found
    independently, so the measurement survives blocks digitised at different
    densities, and edges running across the axis rather than along it are
    rejected, which stops a corner or a junction mouth reading as a wide street.
    """
    index, ka, kb = _edge_index(edges, frame)
    kdir = kb - ka
    klen = np.hypot(kdir[:, 0], kdir[:, 1])
    kdir = kdir / np.where(klen[:, None] > 0, klen[:, None], 1.0)

    for street, lines in zip(streets, parts):
        widths: list[float] = []
        for xy in lines:
            pts = geo.resample(xy, SAMPLE_STEP_M)
            tan = geo.tangents(pts if len(pts) > 1 else xy)
            if len(tan) != len(pts):
                continue
            for p, t in zip(pts, tan):
                cand = index.candidates(p, rings=1)
                if cand.size == 0:
                    continue
                dist, proj = geo.point_segment_distance(p, ka[cand], kb[cand])
                ok = (dist <= MAX_HALF_WIDTH_M) & (np.abs(kdir[cand] @ t) >= PARALLEL_MIN)
                if not ok.any():
                    continue
                normal = np.array([-t[1], t[0]])
                side = (proj - p) @ normal
                left = ok & (side > 0.2)
                right = ok & (side < -0.2)
                if not (left.any() and right.any()):
                    continue
                widths.append(float(dist[left].min() + dist[right].min()))
        if widths:
            street.width_m = round(float(np.median(widths)), 1)


def measure_connections(streets, parts, frame) -> None:
    """Degree of each vía in the street graph, by shared junction points."""
    cell = JUNCTION_TOL_M * 2
    grid: dict[tuple[int, int], set[int]] = collections.defaultdict(set)
    for i, lines in enumerate(parts):
        for xy in lines:
            for cx, cy in np.floor(xy / cell).astype(int):
                grid[(int(cx), int(cy))].add(i)

    neighbours: list[set[int]] = [set() for _ in streets]
    for members in grid.values():
        if len(members) < 2:
            continue
        for i in members:
            neighbours[i] |= members
    for i, n in enumerate(neighbours):
        n.discard(i)
        streets[i].extra["connections"] = len(n)


def _ranks(values: list[float | None]) -> np.ndarray:
    """Percentile rank in [0,1]; missing values sit at the median."""
    arr = np.array([np.nan if v is None else float(v) for v in values])
    known = ~np.isnan(arr)
    out = np.full(len(arr), 0.5)
    if known.sum() > 1:
        order = np.argsort(np.argsort(arr[known]))
        out[known] = order / (known.sum() - 1)
    return out


def compute(streets: list[Street], spec: CitySpec, block_edges=None) -> None:
    """Fill in every geometric field on a city's streets, in place."""
    all_coords = [c for s in streets for line in s.lines for c in line]
    frame = geo.Frame(*spec.centre) if spec.centre else geo.frame_for(all_coords)
    centre_xy = np.array([0.0, 0.0])          # the frame is anchored on the centre

    parts = _flat(streets, frame)

    for street, lines in zip(streets, parts):
        if not lines:
            continue
        street.length_m = round(sum(geo.path_length(xy) for xy in lines), 1)
        pts = np.concatenate(lines)
        mid = pts.mean(axis=0)
        street.centroid = [round(v, 6) for v in frame.lonlat(mid)[0]]
        street.dist_center_m = round(float(np.hypot(*(mid - centre_xy))), 1)

    if block_edges:
        measure_widths(streets, parts, block_edges, frame)
    measure_connections(streets, parts, frame)

    r_len = _ranks([math.log1p(s.length_m) if s.mapped else None for s in streets])
    r_wid = _ranks([s.width_m for s in streets])
    r_con = _ranks([s.extra.get("connections") if s.mapped else None for s in streets])
    r_knd = np.array([KIND_RANK.get(s.kind, DEFAULT_KIND_RANK) for s in streets])
    w = PROMINENCE_WEIGHTS
    score = (w["length"] * r_len + w["width"] * r_wid
             + w["connections"] * r_con + w["kind"] * r_knd)
    for s, v in zip(streets, score):
        s.importance = round(float(v), 4)
