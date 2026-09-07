# Callejero Feminista

**Who a city names its streets after, and how much street it gives them.**

A platform for reading a city's street register as what it is: a list of the
things a city has decided are worth remembering, and a ranking of how much space
each one gets. It groups every street name by what the name *designates* — a real
woman, a saint, a river, a fruit, a guild, a battle — and then lets you compare
those groups on the dimensions that decide how present a name actually is in the
city: length, width, network connections, distance from the centre, and the year
it entered the register.

The first city is **Málaga**, built on the doctoral thesis
*La invisibilidad de las mujeres en el callejero malagueño* (María Luz Linares
Rodríguez, Universidad de Granada, 2024) together with the city's own open
cartographic callejero. The architecture is city-agnostic: a second city is one
adapter, or four lines of configuration if OpenStreetMap will do.

---

## What it shows

**The story.** 20.2 % of Málaga's gendered street names honour women. The thesis
counts 482 women against 2,599 men in the 2022 callejero, and traces the figure
back through 1993 (301) and 1939 (84) — and shows that in the first two of those
callejeros most of the "women" were not women at all but Marian advocations.

**The workbench.** Any of the measurable dimensions against any of the grouping
axes, as distributions rather than averages: the median and interquartile range
per group, so you can see whether a difference in number is also a difference in
rank.

**The map.** The whole street network in 3D over the real relief of the
municipality, coloured by designatum, with any dimension available as a vertical
lift so the quantity being compared is visible in space.

**The method.** Every vía carries the rule that classified it and the evidence
that rule matched on, and the coverage and the gaps are stated on their own tab.

---

## Getting it running

```sh
pip install -r requirements.txt     # numpy, pillow, xlrd, openpyxl
brew install poppler                # pdftotext, for the thesis annexes
make all                            # download, extract, classify, build, bake, bundle
make dev                            # open the viewer
```

The built Málaga bundles are committed under `web/public/data`, so `cd web &&
npm install && npm run build` gives you the site without running the pipeline at
all. You only need `make all` to rebuild the data or to add a city.

**The thesis PDF is not in this repository** — it is not ours to redistribute.
`make thesis` expects it in the repository root as
`las_mujeres_en_el_callejero_malagueño_linares.pdf`; download it from
<https://hdl.handle.net/10481/88267>. The two annex tables it yields are
committed under `data/sources`, so every other step works without it.

`make all` is about ten minutes, most of it the 57 MB municipal download. Every
step is idempotent and re-runnable on its own — see `make help`.

---

## How it is put together

```
pipeline/
  sources.py        fetch the municipal callejero and the INE registers
  thesis.py         rebuild the thesis' annex tables from the PDF
  gazetteers.py     turn INE's registers into name/surname/place lookups
  taxonomy.py       the designatum taxonomy, bilingual, with its palette
  lexicon/es/       the rule packs: roles, head words, terms, myth, places
  classify.py       the rule cascade that decides what a name designates
  llm_classify.py   the model pass over the tail the rules cannot reach
  geo.py            projection, lengths, point-in-polygon, nearest-segment index
  metrics.py        length, width, connections, distance, prominence
  cities/           one adapter per city  (malaga.py, osm.py)
  registry.py       the cities the platform knows about
  build.py          writes the bundle the viewer reads
  terrain.py        bakes the relief from public elevation tiles
web/                the viewer: React, TypeScript, and a WebGL2 renderer
```

### The classifier

A cascade, most authoritative rule first, each verdict recording its own reason:

| rule | what it matches | Málaga |
|---|---|--:|
| `thesis` | the hand-checked list of the 482 women | 467 |
| `role` | a title or trade opens the name — *Escritora*, *Alcalde*, *Sor* | 651 |
| `head` | a classifying first word — *Lagar*, *Río*, *Virgen*, *Santa* | 900 |
| `term` | the whole name is a thing — *Naranjo*, *Bulerías*, *Curtidores* | 138 |
| `myth` / `place` | a mythological figure, or a place incl. all 8,132 INE municipalities | 477 |
| `person` | a given name from INE's register, with a known surname | 1,108 |
| `llm` | the long tail, cached to `data/sources/llm_labels.json` | 2,084 |
| unresolved | honestly unknown | 343 |

**94 %** of the 6,206 vías are classified. The remaining 6 % — 374 vías — are
left unknown rather than guessed, and are visible in the interface as their own
category. (374 rather than 343 because 31 of them are women the thesis itself
records as unidentified: gendered, but with no one attached to the name.)

Three judgements are worth knowing about, because they change the numbers:

- **1900 is not a year.** 1,640 vías carry it as their register date because the
  council bulk-loaded the inherited callejero under one timestamp. It is excluded
  from the age dimension rather than dressed up as history.
- **Carmen, Rosario, Dolores** are at once the commonest women's names in Spain
  and the commonest titles of the Virgin. Where the thesis has not ruled, the vía
  is flagged *contested* and keeps both readings.
- **A surname with no forename** does not say who is honoured. It is labelled as
  such rather than assumed to be a man, though it nearly always is.

### The measurements

All derived from the city's own cartography, so they mean the same thing in any
city an adapter is written for.

- **Width** is the distance between the *built blocks* facing the vía, probed
  every 15 m along its axis and taken as a median. Measuring between kerb lines
  was tried first and is wrong: on a dual carriageway the nearest edge either
  side of the axis is the central median, and Avenida de Andalucía reads as three
  metres wide. Block outlines bound the whole public corridor. Median 11.0 m,
  p95 39.0 m, coverage 98.5 % of mapped vías.
- **Connections** is the vía's degree in the street graph — how many other vías
  touch it — computed from shared junction geometry, no external join needed.
- **Prominence** is a weighted mean of the *percentile ranks* of length, width,
  connections and the prestige of the vía type. Ranks, not raw values, so that
  length (four orders of magnitude) cannot swamp the rest.

### The colours

The categorical palette is computed, not chosen by eye: OKLCH steps inside the
dark-mode lightness band with chroma above the gray floor, ordered so every
adjacent pair clears the colour-vision-deficiency gate, and verified against the
app's own surface. `unknown` is deliberately a reserved neutral outside that set.
See `PALETTE_NOTE` in `pipeline/taxonomy.py`; re-run the validator if you change
anything.

### The 3D view

Plain WebGL2, no mapping library. The terrain is baked once at build time from
AWS Terrain Tiles into a single heightfield, so the published page needs no tile
server, no API key and no network to draw the relief. Streets are screen-space
extruded lines that keep a constant pixel width at any camera angle; per-vía
colour, visibility and lift live in a small texture, so changing a filter costs
one 6 KB upload rather than rebuilding a 4 MB vertex buffer. Picking is done by
reading back an ID buffer.

---

## Adding a city

If the council publishes a cartographic callejero, write an adapter beside
`cities/malaga.py` returning `Street` records, and register it in
`registry.py`. You get official vía types, official districts and real register
dates.

If it does not, the generic OpenStreetMap adapter needs only this:

```python
"granada": CitySpec(
    id="granada", name="Granada", country="ES", language="es",
    centre=(-3.59944, 37.17667), centre_label="Plaza Nueva",
    attribution=("OpenStreetMap contributors (ODbL)",),
),
```

then `make build CITY=granada && make terrain CITY=granada`.

This path is tested, not assumed: `make build CITY=cadiz && make terrain
CITY=cadiz` fetches Cádiz from Overpass and produces a complete bundle — 729
vías, classified, measured and with its relief baked — in under a minute.

Expect two things to be worse than Málaga, and be honest about both:

- **Coverage falls.** Cádiz classifies 70 % against Málaga's 94 %. The rules and
  the INE gazetteers travel; the thesis and the cached model labels do not. Run
  `make classify CITY=cadiz` with an API key to close most of that gap.
- **The age dimension is empty.** OpenStreetMap has no register date, and
  districts depend on what mappers happen to have drawn.

The lexicon is per language, so another Spanish city needs no new rules; another
language needs a new pack under `pipeline/lexicon/`.

---

## Sources and licences

| | |
|---|---|
| Thesis | Linares Rodríguez, M. L. (2024). *La invisibilidad de las mujeres en el callejero malagueño*. Universidad de Granada. ISBN 978-84-1195-115-9. <https://hdl.handle.net/10481/88267> |
| Callejero | Ayuntamiento de Málaga, [datosabiertos.malaga.eu](https://datosabiertos.malaga.eu) — CC BY 4.0 |
| Names, surnames, municipalities | Instituto Nacional de Estadística |
| Relief | AWS Terrain Tiles / Mapzen — ODbL |
| Street data for other cities | OpenStreetMap contributors — ODbL |

The thesis PDF itself is not redistributed here; `pipeline/thesis.py` reads a
copy placed in the repository root and writes only the two annex tables it
needs, which are committed.

## Licence

The code is **GPL-3.0** (see `LICENSE`). The data is not ours to relicense and
keeps its own terms:

- `data/sources/anexo_*.csv` are tables extracted from the thesis; cite Linares
  Rodríguez (2024).
- `web/public/data/*.json` are derived from the Ayuntamiento de Málaga callejero
  (CC BY 4.0) and AWS Terrain Tiles (ODbL) — attribute both, as the viewer does.
- `data/sources/*_ine.json` are derived from Instituto Nacional de Estadística
  registers.
- Bundles built for other cities through the OSM adapter are derived from
  OpenStreetMap and are ODbL, which is a share-alike licence — check what that
  obliges you to before redistributing them.
