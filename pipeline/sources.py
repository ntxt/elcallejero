"""Download everything the pipeline builds on.

    python -m pipeline.sources            # all of it
    python -m pipeline.sources --only ine

Nothing here is committed to the repository: these files are large, they belong
to their publishers, and they change on their publishers' schedules. What the
pipeline derives from them -- the annex tables, the gazetteers, the labels -- is
small and is committed, so a checkout can be rebuilt without re-downloading.

Every file is fetched once and skipped if already present; pass --force to
refresh.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
UA = "callejero-feminista/1.0 (research; street-name analysis)"

MALAGA = "https://datosabiertos.malaga.eu/recursos/urbanismoEInfraestructura/planimetria"
INE = "https://www.ine.es/daco/daco42"

# (group, destination, url, members to keep from a zip)
FILES: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("malaga", "malaga/callejero.zip",
     f"{MALAGA}/callejero/da_cartografiaCallejero-4326-geojson.zip",
     ("da_cartografiaVial-4326.geojson",
      "da_cartografiaTramoVial-4326.geojson",
      "da_cartografiaRelacionTramoVial-4326.geojson",
      "da_cartografiaTipoVial-4326.geojson",
      "da_cartografiaClaseVial-4326.geojson",
      "da_cartografiaDistritoMunicipal-4326.geojson",
      "da_cartografiaBarrio-4326.geojson",
      "da_cartografiaManzana-4326.geojson",
      "da_cartografiaToponimiaVial-4326.geojson")),
    ("malaga", "malaga/tramos_calle_barrio.csv",
     f"{MALAGA}/tramos_calle_BarrioDismuni.csv", ()),
    ("ine", "gazetteers/nombres_por_edad_media.xls",
     f"{INE}/nombyapel/nombres_por_edad_media.xls", ()),
    ("ine", "gazetteers/apellidos_frecuencia.xls",
     f"{INE}/nombyapel/apellidos_frecuencia.xls", ()),
    ("ine", "gazetteers/municipios.xlsx",
     "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx", ()),
]


def fetch(url: str, dest: Path, force: bool) -> bool:
    if dest.exists() and not force:
        print(f"  have {dest.relative_to(RAW)}")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as r, dest.open("wb") as fh:
                shutil.copyfileobj(r, fh)
            print(f"  got  {dest.relative_to(RAW)} "
                  f"({dest.stat().st_size / 1e6:.1f} MB)")
            return True
        except Exception as exc:                       # noqa: BLE001
            if attempt == 2:
                print(f"  FAIL {url}: {exc}", file=sys.stderr)
                raise
            time.sleep(5 * (attempt + 1))
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", choices=sorted({g for g, *_ in FILES}))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    for group, rel, url, members in FILES:
        if args.only and group != args.only:
            continue
        dest = RAW / rel
        if members:
            marker = dest.parent / members[0]
            if marker.exists() and not args.force:
                print(f"  have {marker.relative_to(RAW)} (+{len(members) - 1} more)")
                continue
            fetch(url, dest, True)
            with zipfile.ZipFile(dest) as zf:
                names = {Path(n).name: n for n in zf.namelist()}
                for want in members:
                    if want not in names:
                        print(f"  MISS {want} not in archive", file=sys.stderr)
                        continue
                    with zf.open(names[want]) as src, (dest.parent / want).open("wb") as out:
                        shutil.copyfileobj(src, out)
            dest.unlink()
            print(f"  got  {len(members)} layers into {dest.parent.relative_to(RAW)}")
        else:
            fetch(url, dest, args.force)
    print("sources ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
