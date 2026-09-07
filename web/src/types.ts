/** Shapes of the bundles written by `pipeline/build.py` and `pipeline/terrain.py`. */

export type Lang = "es" | "en";

export interface Labelled { es: string; en: string }

export interface CategoryDef extends Labelled {
  colour: string;
  gendered: boolean;
  sub: Record<string, Labelled>;
}

export interface Taxonomy {
  categories: Record<string, CategoryDef>;
  genders: Record<string, Labelled & { colour: string }>;
  realness: Record<string, Labelled>;
}

export interface CityMeta {
  id: string;
  name: string;
  country: string;
  language: Lang;
  centre: [number, number];
  centreLabel: string;
  bbox: [number, number, number, number];
  attribution: string[];
  notes: Partial<Record<Lang, string>>;
}

export interface ThesisRef {
  source: string;
  handle: string;
  men_2022: number;
  series: { year: number; women: number; model: Labelled }[];
  current: {
    total: number;
    by_category: Record<string, number>;
    by_district: Record<string, number>;
    by_profession: Record<string, number>;
  };
  y1939: { total: number; by_category: Record<string, number>; by_district: Record<string, number> };
}

/** A column is either a plain array or a dictionary-coded one. */
type Coded = { dict: string[]; idx: number[] };
type Column<T> = T[] | Coded;

export interface RawBundle {
  city: CityMeta;
  generated: string;
  taxonomy: Taxonomy;
  prominence: { weights: Record<string, number> };
  thesis: ThesisRef | null;
  columns: Record<string, Column<unknown>> & { alt: Record<string, Alt[]> };
}

export interface Alt { cat: string; sub: string; gender: string; why: string }

/** One vía, as the app works with it. */
export interface Street {
  i: number;
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  district: string | null;
  barrio: string | null;
  year: number | null;
  yearEst: boolean;
  length: number;
  width: number | null;
  distCentre: number | null;
  connections: number | null;
  importance: number;
  centroid: [number, number] | null;
  cat: string;
  sub: string;
  gender: string;
  real: string;
  conf: number;
  rule: string;
  why: string;
  contested: boolean;
  mapped: boolean;
  alt?: Alt[];
}

export interface Geometry { i: number; l: [number, number][][] }

export interface Terrain {
  w: number;
  h: number;
  bbox: [number, number, number, number];
  min: number;
  max: number;
  zoom: number;
  data: string;
  attribution: string;
}

export interface Dataset {
  city: CityMeta;
  generated: string;
  taxonomy: Taxonomy;
  thesis: ThesisRef | null;
  prominence: { weights: Record<string, number> };
  streets: Street[];
}
