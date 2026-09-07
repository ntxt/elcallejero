import type { Alt, Dataset, Geometry, RawBundle, Street, Terrain } from "./types";

/** Undo the dictionary coding applied by the build. */
function column<T>(raw: unknown): (T | null)[] {
  if (Array.isArray(raw)) return raw as (T | null)[];
  const { dict, idx } = raw as { dict: T[]; idx: number[] };
  return idx.map((i) => (i < 0 ? null : dict[i]));
}

export function expand(bundle: RawBundle): Dataset {
  const c = bundle.columns;
  const get = <T,>(k: string) => column<T>(c[k]);
  const name = get<string>("name");
  const alt = c.alt as Record<string, Alt[]>;

  const cols = {
    id: get<string>("id"),
    kind: get<string>("kind"),
    kindLabel: get<string>("kindLabel"),
    district: get<string>("district"),
    barrio: get<string>("barrio"),
    year: get<number>("year"),
    yearEst: get<boolean>("yearEst"),
    length: get<number>("length"),
    width: get<number>("width"),
    distCentre: get<number>("distCentre"),
    connections: get<number>("connections"),
    importance: get<number>("importance"),
    centroid: get<[number, number]>("centroid"),
    cat: get<string>("cat"),
    sub: get<string>("sub"),
    gender: get<string>("gender"),
    real: get<string>("real"),
    conf: get<number>("conf"),
    rule: get<string>("rule"),
    why: get<string>("why"),
    contested: get<boolean>("contested"),
    mapped: get<boolean>("mapped"),
  };

  const streets: Street[] = name.map((n, i) => ({
    i,
    id: cols.id[i]!,
    name: n!,
    kind: cols.kind[i]!,
    kindLabel: cols.kindLabel[i]!,
    district: cols.district[i],
    barrio: cols.barrio[i],
    year: cols.year[i],
    yearEst: !!cols.yearEst[i],
    length: cols.length[i] ?? 0,
    width: cols.width[i],
    distCentre: cols.distCentre[i],
    connections: cols.connections[i],
    importance: cols.importance[i] ?? 0,
    centroid: cols.centroid[i],
    cat: cols.cat[i]!,
    sub: cols.sub[i]!,
    gender: cols.gender[i]!,
    real: cols.real[i]!,
    conf: cols.conf[i] ?? 0,
    rule: cols.rule[i]!,
    why: cols.why[i] ?? "",
    contested: !!cols.contested[i],
    mapped: !!cols.mapped[i],
    alt: alt[String(i)],
  }));

  return {
    city: bundle.city,
    generated: bundle.generated,
    taxonomy: bundle.taxonomy,
    thesis: bundle.thesis,
    prominence: bundle.prominence,
    streets,
  };
}

/** Decode the base64 Int16 heightfield into metres. */
export function decodeTerrain(t: Terrain): Float32Array {
  const bin = atob(t.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer);
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i];
  return out;
}

const BASE = import.meta.env.BASE_URL ?? "./";

/** Bundles inlined into the page by the single-file build, if there are any. */
type Embedded = Record<string, Record<string, unknown>>;
const embedded = (): Embedded =>
  (globalThis as { __CALLEJERO__?: Embedded }).__CALLEJERO__ ?? {};

async function grab<T>(city: string, part: string, file: string): Promise<T> {
  const inline = embedded()[city]?.[part];
  if (inline) return inline as T;
  const res = await fetch(`${BASE}data/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export interface Loaded {
  data: Dataset;
  geometry: Geometry[];
  terrain: Terrain;
  heights: Float32Array;
}

export async function loadCity(id: string): Promise<Loaded> {
  const [bundle, geo, terrain] = await Promise.all([
    grab<RawBundle>(id, "main", `${id}.json`),
    grab<{ g: Geometry[] }>(id, "geo", `${id}.geo.json`),
    grab<Terrain>(id, "terrain", `${id}.terrain.json`),
  ]);
  return {
    data: expand(bundle),
    geometry: geo.g,
    terrain,
    heights: decodeTerrain(terrain),
  };
}
