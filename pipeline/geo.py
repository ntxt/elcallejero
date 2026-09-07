"""Dependency-light planar geometry for city-scale work.

Everything is done in a local metric frame rather than a projected CRS: over the
extent of one city an equirectangular projection about the city's own centre is
accurate to well under 0.1%, which is far below the uncertainty in the source
geometry, and it keeps the pipeline portable to any city without pyproj or a
per-city EPSG code.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

R_LAT_M = 111_132.0          # metres per degree of latitude (mean)


@dataclass(frozen=True)
class Frame:
    """Local metric frame anchored at a city's centre."""
    lon0: float
    lat0: float

    @property
    def mx(self) -> float:
        return R_LAT_M * math.cos(math.radians(self.lat0))

    def xy(self, coords) -> np.ndarray:
        """lon/lat degrees -> (N,2) metres east/north of the anchor.

        Any third ordinate is dropped: Málaga's GeoJSON carries one, but it is
        the source's projected Z put through the same transform as the
        horizontal coordinates, so it is not metres and not usable as height.
        """
        a = np.asarray([c[:2] for c in coords], dtype=float).reshape(-1, 2)
        return np.column_stack(((a[:, 0] - self.lon0) * self.mx,
                                (a[:, 1] - self.lat0) * R_LAT_M))

    def lonlat(self, xy) -> np.ndarray:
        a = np.asarray(xy, dtype=float).reshape(-1, 2)
        return np.column_stack((a[:, 0] / self.mx + self.lon0,
                                a[:, 1] / R_LAT_M + self.lat0))


def frame_for(coords) -> Frame:
    a = np.asarray(coords, dtype=float).reshape(-1, 2)
    return Frame(float(a[:, 0].mean()), float(a[:, 1].mean()))


def path_length(xy: np.ndarray) -> float:
    if len(xy) < 2:
        return 0.0
    d = np.diff(xy, axis=0)
    return float(np.hypot(d[:, 0], d[:, 1]).sum())


def resample(xy: np.ndarray, step: float) -> np.ndarray:
    """Points every `step` metres along a polyline, endpoints included."""
    if len(xy) < 2:
        return xy
    seg = np.hypot(*np.diff(xy, axis=0).T)
    cum = np.concatenate(([0.0], np.cumsum(seg)))
    total = cum[-1]
    if total <= 0:
        return xy[:1]
    n = max(int(total // step), 1) + 1
    targets = np.linspace(0.0, total, n)
    idx = np.clip(np.searchsorted(cum, targets, side="right") - 1, 0, len(seg) - 1)
    frac = np.where(seg[idx] > 0, (targets - cum[idx]) / np.where(seg[idx] > 0, seg[idx], 1), 0.0)
    return xy[idx] + (xy[idx + 1] - xy[idx]) * frac[:, None]


def tangents(xy: np.ndarray) -> np.ndarray:
    """Unit direction at each vertex of a polyline (central differences)."""
    d = np.gradient(xy, axis=0)
    n = np.hypot(d[:, 0], d[:, 1])
    n[n == 0] = 1.0
    return d / n[:, None]


# --- point in polygon -------------------------------------------------------

def points_in_ring(pts: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """Vectorised even-odd test of (N,2) points against one closed ring."""
    x, y = pts[:, 0], pts[:, 1]
    x1, y1 = ring[:-1, 0], ring[:-1, 1]
    x2, y2 = ring[1:, 0], ring[1:, 1]
    inside = np.zeros(len(pts), dtype=bool)
    for i in range(len(x1)):
        cond = (y1[i] > y[:, None].ravel()) != (y2[i] > y)
        if not cond.any():
            continue
        t = (x2[i] - x1[i]) * (y - y1[i]) / np.where(y2[i] - y1[i] == 0, 1e-30, y2[i] - y1[i]) + x1[i]
        inside ^= cond & (x < t)
    return inside


class Polygons:
    """Point-in-polygon lookup over a small set of labelled polygons."""

    def __init__(self, items: list[tuple[str, list[np.ndarray]]]):
        # items: (label, [outer ring, hole, hole, ...]) in metres
        self.items = items
        self.boxes = np.array([
            [min(r[:, 0].min() for r in rings), min(r[:, 1].min() for r in rings),
             max(r[:, 0].max() for r in rings), max(r[:, 1].max() for r in rings)]
            for _, rings in items
        ]) if items else np.zeros((0, 4))

    def label(self, pt: np.ndarray) -> str | None:
        p = pt.reshape(1, 2)
        cand = np.where((self.boxes[:, 0] <= pt[0]) & (pt[0] <= self.boxes[:, 2]) &
                        (self.boxes[:, 1] <= pt[1]) & (pt[1] <= self.boxes[:, 3]))[0]
        for i in cand:
            name, rings = self.items[i]
            if points_in_ring(p, rings[0])[0] and not any(
                    points_in_ring(p, h)[0] for h in rings[1:]):
                return name
        return None


# --- nearest segment index --------------------------------------------------

class SegmentIndex:
    """Uniform grid over line segments, for nearest-segment queries.

    Built once over every kerb line in the city, then queried a few hundred
    thousand times while measuring carriageway widths, so the grid is stored as
    flat sorted arrays rather than a dict of lists.
    """

    def __init__(self, a: np.ndarray, b: np.ndarray, cell: float = 40.0):
        self.a, self.b, self.cell = a, b, cell
        lo = np.minimum(a, b)
        hi = np.maximum(a, b)
        self.origin = lo.min(axis=0) - cell
        # A segment is registered in every cell its bounding box touches.
        c0 = np.floor((lo - self.origin) / cell).astype(np.int32)
        c1 = np.floor((hi - self.origin) / cell).astype(np.int32)
        self.ncx = int(c1[:, 0].max()) + 2
        self.ncy = int(c1[:, 1].max()) + 2
        keys, ids = [], []
        span = (c1 - c0 + 1)
        for n in np.unique(span[:, 0] * 1000 + span[:, 1]):
            sel = np.where(span[:, 0] * 1000 + span[:, 1] == n)[0]
            sx, sy = span[sel[0]]
            for dx in range(sx):
                for dy in range(sy):
                    cx, cy = c0[sel, 0] + dx, c0[sel, 1] + dy
                    keys.append(cx * self.ncy + cy)
                    ids.append(sel)
        self.keys = np.concatenate(keys)
        self.ids = np.concatenate(ids)
        order = np.argsort(self.keys, kind="stable")
        self.keys, self.ids = self.keys[order], self.ids[order]
        self.starts = np.searchsorted(self.keys, np.arange(self.ncx * self.ncy))
        self.ends = np.searchsorted(self.keys, np.arange(self.ncx * self.ncy), side="right")

    def candidates(self, pt: np.ndarray, rings: int = 1) -> np.ndarray:
        cx, cy = ((pt - self.origin) / self.cell).astype(int)
        out = []
        for dx in range(-rings, rings + 1):
            for dy in range(-rings, rings + 1):
                x, y = cx + dx, cy + dy
                if 0 <= x < self.ncx and 0 <= y < self.ncy:
                    k = x * self.ncy + y
                    if self.ends[k] > self.starts[k]:
                        out.append(self.ids[self.starts[k]:self.ends[k]])
        return np.unique(np.concatenate(out)) if out else np.empty(0, dtype=int)


def point_segment_distance(p: np.ndarray, a: np.ndarray, b: np.ndarray):
    """Distance from one point to many segments, plus the closest points."""
    ab = b - a
    denom = (ab * ab).sum(1)
    t = np.where(denom > 0, ((p - a) * ab).sum(1) / np.where(denom > 0, denom, 1), 0.0)
    t = np.clip(t, 0.0, 1.0)
    proj = a + ab * t[:, None]
    return np.hypot(*(p - proj).T), proj


def simplify(xy: np.ndarray, tolerance: float) -> np.ndarray:
    """Ramer-Douglas-Peucker, iterative so a long street cannot blow the stack."""
    n = len(xy)
    if n < 3:
        return xy
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        a, b = xy[lo], xy[hi]
        ab = b - a
        seg = xy[lo + 1:hi]
        norm = math.hypot(*ab)
        if norm == 0:
            d = np.hypot(*(seg - a).T)
        else:
            d = np.abs(np.cross(np.broadcast_to(ab, seg.shape), seg - a)) / norm
        i = int(np.argmax(d))
        if d[i] > tolerance:
            idx = lo + 1 + i
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return xy[keep]
