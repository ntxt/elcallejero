import type { Dataset, Lang, Street, Taxonomy } from "./types";

/** An axis you can split the callejero by. */
export interface Axis {
  id: string;
  label: Record<Lang, string>;
  /** Key for one street, or null when the street does not belong on this axis. */
  key: (s: Street) => string | null;
  /** Human label and colour for a key. */
  meta: (key: string, tx: Taxonomy, lang: Lang) => { label: string; colour: string };
  /** Optional fixed display order. */
  order?: (keys: string[], tx: Taxonomy) => string[];
}

/* A palette for axes the taxonomy does not colour itself. Ordered so that
   adjacent groups stay distinguishable at the small sizes a legend uses, and
   readable on the dark ground the map is drawn on. */
const PALETTE = [
  "#e0567f", "#4f9ad6", "#54b982", "#e0a13c", "#9c74d4", "#3fb3ba",
  "#d4664a", "#7f9c3c", "#c86fb4", "#5c7fd0", "#b58a3e", "#4aa8a0",
  "#d4557a", "#6f8fd8", "#68b95c", "#cf8b3a", "#8c7fd6", "#3ea8ac",
];

function hashed(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export const ERA_BREAKS = [1900, 1940, 1960, 1975, 1990, 2000, 2010];

export function eraKey(year: number | null): string | null {
  if (year == null) return null;
  if (year < ERA_BREAKS[0]) return "pre1900";
  for (let i = ERA_BREAKS.length - 1; i >= 0; i--) {
    if (year >= ERA_BREAKS[i]) return String(ERA_BREAKS[i]);
  }
  return "pre1900";
}

const ERA_LABEL: Record<string, Record<Lang, string>> = {
  pre1900: { es: "Antes de 1900", en: "Before 1900" },
  "1900": { es: "1900–1939", en: "1900–1939" },
  "1940": { es: "1940–1959", en: "1940–1959" },
  "1960": { es: "1960–1974", en: "1960–1974" },
  "1975": { es: "1975–1989", en: "1975–1989" },
  "1990": { es: "1990–1999", en: "1990–1999" },
  "2000": { es: "2000–2009", en: "2000–2009" },
  "2010": { es: "2010–hoy", en: "2010–today" },
};

/* Warm for the old city, cool for the recent one, so the era legend reads as a
   timeline rather than as an arbitrary set of colours. */
const ERA_COLOUR: Record<string, string> = {
  pre1900: "#7c5a3a", "1900": "#a06b3c", "1940": "#c08744", "1960": "#cfa14a",
  "1975": "#7fa04a", "1990": "#4f9c8a", "2000": "#4a83b8", "2010": "#7a68c4",
};

export const AXES: Axis[] = [
  {
    id: "cat",
    label: { es: "Qué designa", en: "What it designates" },
    key: (s) => s.cat,
    meta: (k, tx, lang) => ({
      label: tx.categories[k]?.[lang] ?? k,
      colour: tx.categories[k]?.colour ?? hashed(k),
    }),
    order: (keys, tx) => {
      const all = Object.keys(tx.categories);
      return keys.slice().sort((a, b) => all.indexOf(a) - all.indexOf(b));
    },
  },
  {
    id: "gender",
    label: { es: "Género del referente", en: "Gender of the referent" },
    key: (s) => s.gender,
    meta: (k, tx, lang) => ({
      label: tx.genders[k]?.[lang] ?? k,
      colour: tx.genders[k]?.colour ?? hashed(k),
    }),
    order: (keys) => {
      const want = ["f", "m", "mixed", "unknown", "none"];
      return keys.slice().sort((a, b) => want.indexOf(a) - want.indexOf(b));
    },
  },
  {
    id: "sub",
    label: { es: "Subcategoría", en: "Subcategory" },
    key: (s) => `${s.cat}/${s.sub}`,
    meta: (k, tx, lang) => {
      const [cat, sub] = k.split("/");
      return {
        label: tx.categories[cat]?.sub[sub]?.[lang] ?? sub,
        colour: tx.categories[cat]?.colour ?? hashed(k),
      };
    },
  },
  {
    id: "real",
    label: { es: "¿Existió?", en: "Did it exist?" },
    key: (s) => s.real,
    meta: (k, tx, lang) => ({
      label: tx.realness[k]?.[lang] ?? k,
      colour: { real: "#4f9ad6", fictional: "#9c74d4", "n/a": "#6b7280", unknown: "#9ca3af" }[k]
        ?? hashed(k),
    }),
  },
  {
    id: "kind",
    label: { es: "Tipo de vía", en: "Type of way" },
    key: (s) => s.kind,
    meta: (k, _tx, _lang) => ({ label: k, colour: hashed(k) }),
  },
  {
    id: "district",
    label: { es: "Distrito", en: "District" },
    key: (s) => s.district,
    meta: (k) => ({ label: k, colour: hashed(k) }),
  },
  {
    id: "era",
    label: { es: "Época de alta", en: "Era first registered" },
    // The 1900 bulk load is not a date, so those vías belong on no era at all
    // rather than swelling the earliest bucket by sixteen hundred entries.
    key: (s) => (s.yearEst ? null : eraKey(s.year)),
    meta: (k, _tx, lang) => ({
      label: ERA_LABEL[k]?.[lang] ?? k,
      colour: ERA_COLOUR[k] ?? hashed(k),
    }),
    order: (keys) => {
      const want = ["pre1900", ...ERA_BREAKS.map(String)];
      return keys.slice().sort((a, b) => want.indexOf(a) - want.indexOf(b));
    },
  },
  {
    id: "rule",
    label: { es: "Cómo se clasificó", en: "How it was classified" },
    key: (s) => s.rule,
    meta: (k, _tx, lang) => ({
      label: RULE_LABEL[k]?.[lang] ?? k,
      colour: RULE_COLOUR[k] ?? hashed(k),
    }),
  },
];

export const RULE_LABEL: Record<string, Record<Lang, string>> = {
  thesis: { es: "Tesis (Anexo III)", en: "Thesis (Annex III)" },
  role: { es: "Título u oficio", en: "Title or role" },
  head: { es: "Palabra inicial", en: "Head word" },
  term: { es: "Término del léxico", en: "Lexicon term" },
  myth: { es: "Mitología", en: "Mythology" },
  place: { es: "Gacetero de lugares", en: "Place gazetteer" },
  person: { es: "Nombre y apellido (INE)", en: "Given name + surname (INE)" },
  given_only: { es: "Sólo nombre de pila", en: "Given name only" },
  surname_only: { es: "Sólo apellido", en: "Surname only" },
  surname_pair: { es: "Apellidos, sin nombre", en: "Surnames, no forename" },
  marian: { es: "Advocación mariana", en: "Marian devotion" },
  llm: { es: "Modelo de lenguaje", en: "Language model" },
  none: { es: "Sin resolver", en: "Unresolved" },
};

const RULE_COLOUR: Record<string, string> = {
  thesis: "#d1477a", role: "#4f9ad6", head: "#54b982", term: "#e0a13c",
  myth: "#9c74d4", place: "#3fb3ba", person: "#5c7fd0", given_only: "#b58a3e",
  surname_only: "#9ca3af", surname_pair: "#8b9199", marian: "#d98324",
  llm: "#8c7fd6", none: "#6b7280",
};

/** A measurable property you can compare groups on. */
export interface Dimension {
  id: string;
  label: Record<Lang, string>;
  unit: Record<Lang, string>;
  value: (s: Street) => number | null;
  /** Long-tailed quantities read better on a log scale. */
  log?: boolean;
  /**
   * Whether adding the group up means anything. Length does: 140 km of street
   * named after women against 570 km named after men is the question the
   * platform is actually asking. Widths and years do not -- a total width is
   * not a quantity.
   */
  summable?: boolean;
  /** How to render a summed value, when it differs from a single one. */
  formatTotal?: (v: number, lang: Lang) => string;
  format: (v: number, lang: Lang) => string;
  note?: Record<Lang, string>;
}

/** Metres below a kilometre, kilometres above, without trailing zeros. */
const m = (v: number) => {
  if (v < 1000) return `${Math.round(v)} m`;
  const km = v / 1000;
  return `${km < 10 ? km.toFixed(1).replace(/\.0$/, "") : Math.round(km)} km`;
};

export const DIMENSIONS: Dimension[] = [
  {
    id: "length",
    label: { es: "Longitud", en: "Length" },
    unit: { es: "metros", en: "metres" },
    value: (s) => (s.mapped ? s.length : null),
    log: true,
    summable: true,
    format: (v) => m(v),
    formatTotal: (v, lang) =>
      `${(v / 1000).toLocaleString(lang === "es" ? "es-ES" : "en-GB",
        { maximumFractionDigits: 0 })} km`,
  },
  {
    id: "width",
    label: { es: "Anchura", en: "Width" },
    unit: { es: "metros", en: "metres" },
    value: (s) => s.width,
    format: (v) => `${v.toFixed(1)} m`,
    note: {
      es: "Distancia entre las manzanas edificadas que dan a la vía, medida cada 15 m sobre el eje y tomada como mediana.",
      en: "Distance between the built blocks facing the way, probed every 15 m along its axis and taken as a median.",
    },
  },
  {
    id: "importance",
    label: { es: "Prominencia", en: "Prominence" },
    unit: { es: "índice 0–1", en: "0–1 index" },
    value: (s) => s.importance,
    format: (v) => v.toFixed(3),
    note: {
      es: "Media ponderada de los rangos percentiles de longitud, anchura, conexiones y jerarquía del tipo de vía.",
      en: "Weighted mean of the percentile ranks of length, width, connections and the prestige of the way type.",
    },
  },
  {
    id: "connections",
    label: { es: "Conexiones", en: "Connections" },
    unit: { es: "vías que la cruzan", en: "ways meeting it" },
    value: (s) => (s.mapped ? s.connections : null),
    summable: true,
    format: (v) => String(Math.round(v)),
  },
  {
    id: "distCentre",
    label: { es: "Distancia al centro", en: "Distance from centre" },
    unit: { es: "metros", en: "metres" },
    value: (s) => s.distCentre,
    format: (v) => m(v),
  },
  {
    id: "year",
    label: { es: "Año de alta", en: "Year registered" },
    unit: { es: "año", en: "year" },
    value: (s) => (s.yearEst ? null : s.year),
    format: (v) => String(Math.round(v)),
    note: {
      es: "Fecha de alta en el registro municipal. El año 1900 es una carga masiva heredada, no una fecha real, y queda excluido.",
      en: "Date the way entered the municipal register. The year 1900 is an inherited bulk load rather than a real date, and is excluded.",
    },
  },
];

export interface GroupStat {
  key: string;
  label: string;
  colour: string;
  n: number;
  values: number[];
  min: number; q1: number; median: number; q3: number; max: number; mean: number;
  total: number;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarise(
  streets: Street[], axis: Axis, dim: Dimension, data: Dataset, lang: Lang,
): GroupStat[] {
  const buckets = new Map<string, number[]>();
  for (const s of streets) {
    const k = axis.key(s);
    if (k == null) continue;
    const v = dim.value(s);
    if (v == null || !Number.isFinite(v)) continue;
    const arr = buckets.get(k);
    if (arr) arr.push(v); else buckets.set(k, [v]);
  }
  let keys = [...buckets.keys()];
  keys = axis.order ? axis.order(keys, data.taxonomy) : keys.sort(
    (a, b) => buckets.get(b)!.length - buckets.get(a)!.length,
  );
  return keys.map((key) => {
    const values = buckets.get(key)!.sort((a, b) => a - b);
    const meta = axis.meta(key, data.taxonomy, lang);
    return {
      key, label: meta.label, colour: meta.colour, n: values.length, values,
      total: values.reduce((a, b) => a + b, 0),
      min: values[0],
      q1: quantile(values, 0.25),
      median: quantile(values, 0.5),
      q3: quantile(values, 0.75),
      max: values[values.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    };
  });
}

export function counts(streets: Street[], axis: Axis, data: Dataset, lang: Lang) {
  const buckets = new Map<string, number>();
  for (const s of streets) {
    const k = axis.key(s);
    if (k == null) continue;
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  let keys = [...buckets.keys()];
  keys = axis.order ? axis.order(keys, data.taxonomy)
    : keys.sort((a, b) => buckets.get(b)! - buckets.get(a)!);
  return keys.map((key) => ({
    key, n: buckets.get(key)!, ...axis.meta(key, data.taxonomy, lang),
  }));
}
