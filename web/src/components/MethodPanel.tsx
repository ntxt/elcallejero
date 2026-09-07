import { useMemo } from "react";
import { BarChart } from "./charts";
import { AXES, RULE_LABEL, counts } from "../grouping";
import { nfmt, pct, t } from "../i18n";
import type { Dataset, Lang } from "../types";

const RULE_AXIS = AXES.find((a) => a.id === "rule")!;

export function MethodPanel({ data, lang }: { data: Dataset; lang: Lang }) {
  const byRule = useMemo(
    () => counts(data.streets, RULE_AXIS, data, lang).map((c) => ({ ...c, value: c.n })),
    [data, lang],
  );
  const total = data.streets.length;
  const classified = data.streets.filter((s) => s.cat !== "unknown").length;
  const mapped = data.streets.filter((s) => s.mapped).length;
  const withWidth = data.streets.filter((s) => s.width != null).length;
  const contested = data.streets.filter((s) => s.contested).length;

  const es = lang === "es";

  return (
    <div className="panel">
      <h2>{t("methodTitle", lang)}</h2>
      <p className="lead">
        {es
          ? "Cada vía lleva registrada la regla que la clasificó y la evidencia concreta en la que se apoya. Ninguna cifra de esta plataforma procede de un juicio que no se pueda rastrear."
          : "Every way carries the rule that classified it and the specific evidence it rests on. No figure on this platform comes from a judgement you cannot trace."}
      </p>

      <section>
        <h3>{t("coverage", lang)}</h3>
        <div className="stat-row">
          <div className="stat">
            <div className="v">{pct((classified / total) * 100, lang, 1)}</div>
            <div className="k">{es ? "vías clasificadas" : "ways classified"}</div>
          </div>
          <div className="stat">
            <div className="v">{pct((mapped / total) * 100, lang, 1)}</div>
            <div className="k">{es ? "con trazado" : "with geometry"}</div>
          </div>
          <div className="stat">
            <div className="v">{pct((withWidth / mapped) * 100, lang, 1)}</div>
            <div className="k">{es ? "con anchura medida" : "with a measured width"}</div>
          </div>
        </div>
        <p className="footnote">
          {nfmt(total, lang)} {es ? "vías vigentes" : "ways on the register"} ·{" "}
          {nfmt(total - classified, lang)} {es ? "sin resolver" : "unresolved"} ·{" "}
          {nfmt(contested, lang)} {es ? "con lectura disputada" : "contested"}
        </p>
      </section>

      <section>
        <h3>{t("howClassified", lang)}</h3>
        <p className="sub">
          {es
            ? "Las reglas se aplican en cascada, de la más autorizada a la más débil. La tesis manda sobre todas las demás."
            : "The rules run in a cascade, most authoritative first. The thesis overrules everything else."}
        </p>
        <BarChart data={byRule} format={(v) => nfmt(v, lang)} />
        <p className="footnote" style={{ marginTop: 10 }}>
          {es
            ? <><b>{RULE_LABEL.thesis.es}</b> es el listado revisado a mano de las 482 mujeres del callejero. <b>{RULE_LABEL.person.es}</b> compara los nombres con el padrón del INE. <b>{RULE_LABEL.llm.es}</b> resuelve la cola larga que ninguna regla alcanza, y sus etiquetas quedan guardadas en el repositorio para poder corregirlas.</>
            : <><b>{RULE_LABEL.thesis.en}</b> is the hand-checked list of the 482 women in the callejero. <b>{RULE_LABEL.person.en}</b> matches names against the national register. <b>{RULE_LABEL.llm.en}</b> resolves the long tail no rule reaches, and its labels are stored in the repository so they can be corrected.</>}
        </p>
      </section>

      <section>
        <h3>{t("sources", lang)}</h3>
        <ul className="footnote" style={{ paddingLeft: 18, margin: 0 }}>
          {data.thesis && (
            <li style={{ marginBottom: 6 }}>
              {data.thesis.source} ·{" "}
              <a href={data.thesis.handle} target="_blank" rel="noreferrer noopener">
                {data.thesis.handle}
              </a>
            </li>
          )}
          {data.city.attribution.map((a) => (
            <li key={a} style={{ marginBottom: 6 }}>{a}</li>
          ))}
          <li style={{ marginBottom: 6 }}>
            {es
              ? "INE: nombres del Padrón Continuo (2022) y apellidos del Censo (2025); diccionario de municipios (2025)."
              : "INE: given names from the Padrón Continuo (2022) and surnames from the Census (2025); municipal dictionary (2025)."}
          </li>
        </ul>
      </section>

      <section>
        <h3>{t("caveats", lang)}</h3>
        <ul className="footnote" style={{ paddingLeft: 18, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            {es
              ? <><b>El año 1900 no es un año.</b> 1.640 vías lo llevan como fecha de alta porque el registro municipal cargó de golpe el callejero heredado. Queda excluido de la dimensión temporal en lugar de fingir precisión.</>
              : <><b>1900 is not a year.</b> 1,640 ways carry it as their register date because the municipal system bulk-loaded the inherited callejero. It is excluded from the time dimension rather than faking precision.</>}
          </li>
          <li style={{ marginBottom: 8 }}>
            {es
              ? <><b>Carmen, Rosario, Dolores.</b> Son a la vez los nombres de mujer más frecuentes de España y los títulos más frecuentes de la Virgen. Donde la tesis no lo resuelve, la vía queda marcada como disputada y conserva las dos lecturas.</>
              : <><b>Carmen, Rosario, Dolores.</b> These are at once the commonest women's names in Spain and the commonest titles of the Virgin. Where the thesis does not settle it, the way is marked contested and keeps both readings.</>}
          </li>
          <li style={{ marginBottom: 8 }}>
            {es
              ? <><b>Un apellido sin nombre no dice a quién honra.</b> Se etiqueta como tal en vez de suponer que es un hombre, aunque casi siempre lo sea.</>
              : <><b>A surname with no forename does not say who is honoured.</b> It is labelled as such rather than assumed to be a man, even though it almost always is.</>}
          </li>
          <li>
            {data.city.notes[lang] ?? data.city.notes.es}
          </li>
        </ul>
      </section>
    </div>
  );
}
