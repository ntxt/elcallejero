import { AXES, DIMENSIONS, type Axis, type Dimension } from "../grouping";
import { nfmt, t } from "../i18n";
import type { Dataset, Lang, Street } from "../types";

export interface ViewState {
  axisId: string;
  liftId: string | null;
  hidden: Set<string>;
  search: string;
  onlyMapped: boolean;
  exaggeration: number;
  lineWidth: number;
}

export function Controls({
  data, lang, view, setView, legend, shown, total,
}: {
  data: Dataset;
  lang: Lang;
  view: ViewState;
  setView: (fn: (v: ViewState) => ViewState) => void;
  legend: { key: string; label: string; colour: string; n: number }[];
  shown: number;
  total: number;
}) {
  const axis = AXES.find((a) => a.id === view.axisId)!;
  const anyHidden = view.hidden.size > 0;

  const toggle = (key: string) =>
    setView((v) => {
      const hidden = new Set(v.hidden);
      if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
      return { ...v, hidden };
    });

  // Clicking a group on its own isolates it; clicking it again brings the rest
  // back. It is the fastest way to answer "where are the X streets?".
  const isolate = (key: string) =>
    setView((v) => {
      const others = legend.filter((l) => l.key !== key).map((l) => l.key);
      const isolated = others.every((k) => v.hidden.has(k)) && !v.hidden.has(key);
      return { ...v, hidden: isolated ? new Set() : new Set(others) };
    });

  return (
    <aside className="rail">
      <div className="group">
        <h3>{t("colourBy", lang)}</h3>
        <select
          value={view.axisId}
          onChange={(e) => setView((v) => ({ ...v, axisId: e.target.value, hidden: new Set() }))}
          aria-label={t("colourBy", lang)}
        >
          {AXES.map((a: Axis) => (
            <option key={a.id} value={a.id}>{a.label[lang]}</option>
          ))}
        </select>
      </div>

      <div className="group">
        <div className="toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>{axis.label[lang]}</h3>
          {anyHidden && (
            <button className="btn" onClick={() => setView((v) => ({ ...v, hidden: new Set() }))}>
              {t("reset", lang)}
            </button>
          )}
        </div>
        <div className="legend">
          {legend.map((l) => {
            const off = view.hidden.has(l.key);
            return (
              <button
                key={l.key}
                className={off ? "off" : ""}
                aria-pressed={!off}
                title={`${l.label} — ${nfmt(l.n, lang)} ${t("ways", lang)}`}
                onClick={(e) => (e.altKey || e.metaKey ? isolate(l.key) : toggle(l.key))}
                onDoubleClick={() => isolate(l.key)}
              >
                <span className="swatch" style={{ background: l.colour }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.label}
                </span>
                <span className="n">{nfmt(l.n, lang)}</span>
              </button>
            );
          })}
        </div>
        <p className="count">
          {t("showing", lang)} <b>{nfmt(shown, lang)}</b> {t("of", lang)}{" "}
          <b>{nfmt(total, lang)}</b> {t("ways", lang)}
        </p>
      </div>

      <div className="group">
        <h3>{t("filters", lang)}</h3>
        <div className="field">
          <input
            type="search" placeholder={t("search", lang)} value={view.search}
            onChange={(e) => setView((v) => ({ ...v, search: e.target.value }))}
            aria-label={t("search", lang)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox" checked={view.onlyMapped}
            onChange={(e) => setView((v) => ({ ...v, onlyMapped: e.target.checked }))}
          />
          {t("onlyMapped", lang)}
        </label>
      </div>

      <div className="group">
        <h3>{t("liftBy", lang)}</h3>
        <div className="field">
          <select
            value={view.liftId ?? ""}
            onChange={(e) => setView((v) => ({ ...v, liftId: e.target.value || null }))}
            aria-label={t("liftBy", lang)}
          >
            <option value="">{t("liftNone", lang)}</option>
            {DIMENSIONS.map((d: Dimension) => (
              <option key={d.id} value={d.id}>{d.label[lang]}</option>
            ))}
          </select>
        </div>
        <p className="footnote">{t("liftHelp", lang)}</p>
      </div>

      <div className="group">
        <h3>{t("relief", lang)}</h3>
        <input
          type="range" min={0} max={6} step={0.1} value={view.exaggeration}
          onChange={(e) => setView((v) => ({ ...v, exaggeration: +e.target.value }))}
          aria-label={t("relief", lang)}
        />
        <h3 style={{ marginTop: 12 }}>{t("thickness", lang)}</h3>
        <input
          type="range" min={0.6} max={4} step={0.1} value={view.lineWidth}
          onChange={(e) => setView((v) => ({ ...v, lineWidth: +e.target.value }))}
          aria-label={t("thickness", lang)}
        />
      </div>

      <div className="group">
        <p className="footnote">
          {data.city.attribution.map((a) => <span key={a}>{a}<br /></span>)}
        </p>
      </div>
    </aside>
  );
}

/** Streets surviving the current filters. */
export function applyFilters(streets: Street[], view: ViewState, axis: Axis): Street[] {
  const needle = view.search.trim().toLowerCase();
  return streets.filter((s) => {
    if (view.onlyMapped && !s.mapped) return false;
    const key = axis.key(s);
    if (key != null && view.hidden.has(key)) return false;
    if (needle && !s.name.toLowerCase().includes(needle)
      && !s.kindLabel.toLowerCase().includes(needle)
      && !(s.barrio ?? "").toLowerCase().includes(needle)) return false;
    return true;
  });
}
