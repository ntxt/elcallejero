import type { Lang } from "./types";

const S = {
  title: { es: "Callejero Feminista", en: "Callejero Feminista" },
  tagline: {
    es: "A quién nombra la ciudad, y con cuánta calle",
    en: "Who the city names, and how much street it gives them",
  },
  tabStory: { es: "El relato", en: "The story" },
  tabLab: { es: "Laboratorio", en: "Workbench" },
  tabMethod: { es: "Método", en: "Method" },

  loading: { es: "Cargando el callejero…", en: "Loading the callejero…" },
  noWebgl: {
    es: "Este navegador no soporta WebGL 2, necesario para la vista 3D. Los datos y las comparativas siguen disponibles.",
    en: "This browser has no WebGL 2, which the 3D view needs. The data and the comparisons still work.",
  },

  colourBy: { es: "Colorear por", en: "Colour by" },
  liftBy: { es: "Elevar por", en: "Lift by" },
  liftNone: { es: "Sin elevación", en: "Flat on the terrain" },
  liftHelp: {
    es: "Separa las vías del terreno según la dimensión elegida: cuanto más alto flota una calle, mayor es su valor.",
    en: "Floats each way above the terrain by the chosen dimension: the higher it sits, the larger its value.",
  },
  relief: { es: "Relieve", en: "Relief" },
  thickness: { es: "Grosor", en: "Thickness" },

  filters: { es: "Filtros", en: "Filters" },
  search: { es: "Buscar una vía…", en: "Search for a way…" },
  clear: { es: "Limpiar", en: "Clear" },
  showing: { es: "Mostrando", en: "Showing" },
  of: { es: "de", en: "of" },
  ways: { es: "vías", en: "ways" },
  onlyMapped: { es: "Sólo vías con trazado", en: "Only ways with geometry" },
  reset: { es: "Restablecer", en: "Reset" },

  dimension: { es: "Dimensión", en: "Dimension" },
  splitBy: { es: "Comparar por", en: "Compare by" },
  median: { es: "mediana", en: "median" },
  count: { es: "vías", en: "ways" },
  range: { es: "rango intercuartílico", en: "interquartile range" },
  noData: { es: "Sin datos suficientes", en: "Not enough data" },

  gapHeadline: { es: "La brecha", en: "The gap" },
  gapLead: {
    es: "De las vías de Málaga que recuerdan a una persona o a una figura con género, éstas son las que nombran a mujeres.",
    en: "Of the ways in Málaga that commemorate a person or a gendered figure, these are the ones naming women.",
  },
  women: { es: "mujeres", en: "women" },
  men: { es: "hombres", en: "men" },
  timeline: { es: "Tres callejeros, ochenta años", en: "Three callejeros, eighty years" },
  timelineLead: {
    es: "Mujeres presentes en el callejero oficial de Málaga en cada uno de los tres momentos que estudia la tesis, y el modelo de feminidad predominante en cada uno.",
    en: "Women present in Málaga's official callejero at each of the three moments the thesis studies, and the model of femininity that predominated in each.",
  },
  whoAreThey: { es: "¿Y quiénes son ellas?", en: "And who are they?" },
  whoLead: {
    es: "Dedicación de las 482 mujeres del callejero actual, según la clasificación de la tesis.",
    en: "What the 482 women in the current callejero are commemorated for, as classified in the thesis.",
  },
  notJustHowMany: { es: "No sólo cuántas: cuánta calle", en: "Not only how many: how much street" },
  notJustLead: {
    es: "Una calle no es una unidad. Comparando las vías de mujeres con las de hombres en cada dimensión medible se ve si la diferencia es sólo de número o también de rango.",
    en: "A street is not a unit. Comparing women's ways with men's on each measurable dimension shows whether the difference is only one of number or also one of rank.",
  },
  everythingElse: { es: "Todo lo demás", en: "Everything else" },
  everythingLead: {
    es: "Las personas son sólo una parte del callejero. El resto nombra santos, lugares, lagares, plantas, oficios, obras y fechas.",
    en: "People are only part of the callejero. The rest names saints, places, farmsteads, plants, trades, works and dates.",
  },

  detail: { es: "Ficha", en: "Detail" },
  designatum: { es: "Designatum", en: "Designatum" },
  evidence: { es: "Evidencia", en: "Evidence" },
  contested: { es: "Lectura disputada", en: "Contested reading" },
  contestedHelp: {
    es: "Este nombre admite más de una lectura y la fuente municipal no la resuelve.",
    en: "This name admits more than one reading and the municipal source does not settle it.",
  },
  alsoReads: { es: "También se lee como", en: "Also reads as" },
  registered: { es: "Alta en el registro", en: "Entered the register" },
  estimated: { es: "carga heredada, no una fecha real", en: "inherited bulk load, not a real date" },
  district: { es: "Distrito", en: "District" },
  barrio: { es: "Barrio", en: "Neighbourhood" },
  notMapped: { es: "Sin trazado en la fuente municipal", en: "No geometry in the municipal source" },
  close: { es: "Cerrar", en: "Close" },
  pickAWay: {
    es: "Pulsa una vía en el mapa para ver su ficha.",
    en: "Click a way on the map to see its detail.",
  },

  methodTitle: { es: "Cómo se construye esto", en: "How this is built" },
  sources: { es: "Fuentes", en: "Sources" },
  howClassified: { es: "Cómo se clasificó cada vía", en: "How each way was classified" },
  coverage: { es: "Cobertura", en: "Coverage" },
  caveats: { es: "Advertencias", en: "Caveats" },

  drag: { es: "Arrastra para girar · rueda para acercar · Mayús+arrastre para desplazar", en: "Drag to orbit · wheel to zoom · Shift-drag to pan" },
  topBy: { es: "Mayores por", en: "Largest by" },
  table: { es: "Tabla", en: "Table" },
  chart: { es: "Gráfico", en: "Chart" },
} as const;

export type Key = keyof typeof S;
export const t = (key: Key, lang: Lang): string => S[key][lang];
export const nfmt = (n: number, lang: Lang) =>
  n.toLocaleString(lang === "es" ? "es-ES" : "en-GB");
export const pct = (n: number, lang: Lang, dp = 1) =>
  `${n.toLocaleString(lang === "es" ? "es-ES" : "en-GB", {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  })} %`;
