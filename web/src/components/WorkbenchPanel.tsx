import { useMemo, useState } from "react";
import { BarChart, RangeChart } from "./charts";
import { AXES, DIMENSIONS, counts, summarise } from "../grouping";
import { nfmt, t } from "../i18n";
import type { Dataset, Lang, Street } from "../types";

export function WorkbenchPanel({
  data, streets, lang, splitId, setSplitId, onSelect,
}: {
  data: Dataset;
  streets: Street[];
  lang: Lang;
  splitId: string;
  setSplitId: (id: string) => void;
  onSelect: (index: number) => void;
}) {
  const [dimId, setDimId] = useState("length");
  const [view, setView] = useState<"chart" | "table">("chart");
  const dim = DIMENSIONS.find((d) => d.id === dimId)!;
  const axis = AXES.find((a) => a.id === splitId)!;

  const ranges = useMemo(
    () => summarise(streets, axis, dim, data, lang).filter((g) => g.n >= 3),
    [streets, axis, dim, data, lang],
  );
  const tally = useMemo(() => counts(streets, axis, data, lang), [streets, axis, data, lang]);

  const scale = useMemo(() => {
    const vals = ranges.flatMap((g) => [g.min, g.max]);
    return vals.length ? ([Math.min(...vals), Math.max(...vals)] as const) : ([0, 1] as const);
  }, [ranges]);

  const top = useMemo(() => {
    const withValue = streets
      .map((s) => ({ s, v: dim.value(s) }))
      .filter((r): r is { s: Street; v: number } => r.v != null && Number.isFinite(r.v));
    withValue.sort((a, b) => b.v - a.v);
    return withValue.slice(0, 30);
  }, [streets, dim]);

  return (
    <div className="panel">
      <h2>{t("tabLab", lang)}</h2>
      <p className="lead">
        {lang === "es"
          ? "Elige una dimensión medible y un criterio para agrupar. Cada grupo se resume por su mediana y su rango intercuartílico; los bigotes marcan el mínimo y el máximo."
          : "Pick a measurable dimension and a way to group. Each group is summarised by its median and interquartile range; the whiskers mark the minimum and maximum."}
      </p>

      <section>
        <div className="field">
          <label htmlFor="dim">{t("dimension", lang)}</label>
          <select id="dim" value={dimId} onChange={(e) => setDimId(e.target.value)}>
            {DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.label[lang]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="split">{t("splitBy", lang)}</label>
          <select id="split" value={splitId} onChange={(e) => setSplitId(e.target.value)}>
            {AXES.map((a) => <option key={a.id} value={a.id}>{a.label[lang]}</option>)}
          </select>
        </div>
        {dim.note && <p className="note">{dim.note[lang]}</p>}
      </section>

      <section>
        <div className="toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>
            {dim.label[lang]} <span className="muted" style={{ color: "var(--ink-3)", fontWeight: 400 }}>
              · {dim.unit[lang]}
            </span>
          </h3>
          <button className="btn" onClick={() => setView(view === "chart" ? "table" : "chart")}>
            {view === "chart" ? t("table", lang) : t("chart", lang)}
          </button>
        </div>
        {ranges.length === 0 ? (
          <p className="empty">{t("noData", lang)}</p>
        ) : view === "chart" ? (
          <RangeChart
            data={ranges} format={(v) => dim.format(v, lang)}
            scaleMin={scale[0]} scaleMax={scale[1]} log={dim.log} unit={dim.unit[lang]}
          />
        ) : (
          <div className="scroller">
            <table className="datatable">
              <thead>
                <tr>
                  <th>{axis.label[lang]}</th>
                  <th className="num">{t("count", lang)}</th>
                  <th className="num">{t("median", lang)}</th>
                  <th className="num">p25</th>
                  <th className="num">p75</th>
                  {dim.summable && <th className="num">{t("total", lang)}</th>}
                </tr>
              </thead>
              <tbody>
                {ranges.map((g) => (
                  <tr key={g.key}>
                    <td><span className="swatch" style={{ background: g.colour }} />{g.label}</td>
                    <td className="num">{nfmt(g.n, lang)}</td>
                    <td className="num">{dim.format(g.median, lang)}</td>
                    <td className="num">{dim.format(g.q1, lang)}</td>
                    <td className="num">{dim.format(g.q3, lang)}</td>
                    {dim.summable && (
                      <td className="num">
                        {(dim.formatTotal ?? dim.format)(g.total, lang)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3>{axis.label[lang]}</h3>
        <p className="sub">{nfmt(streets.length, lang)} {t("ways", lang)}</p>
        <BarChart data={tally.map((c) => ({ ...c, value: c.n }))}
          format={(v) => nfmt(v, lang)} maxRows={16} />
      </section>

      <section>
        <h3>{t("topBy", lang)} {dim.label[lang].toLowerCase()}</h3>
        <div className="scroller">
          <table className="datatable">
            <tbody>
              {top.map(({ s, v }) => (
                <tr key={s.i} onClick={() => onSelect(s.i)}>
                  <td>
                    <span className="swatch"
                      style={{ background: axis.meta(axis.key(s) ?? "", data.taxonomy, lang).colour }} />
                    {s.kindLabel} {s.name}
                  </td>
                  <td className="num">{dim.format(v, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
