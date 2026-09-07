import { useCallback, useEffect, useMemo, useState } from "react";
import { Controls, applyFilters, type ViewState } from "./components/Controls";
import { MapCanvas, type StyleSpec } from "./components/MapCanvas";
import { MethodPanel } from "./components/MethodPanel";
import { StoryPanel } from "./components/StoryPanel";
import { StreetCard } from "./components/StreetCard";
import { WorkbenchPanel } from "./components/WorkbenchPanel";
import { AXES, DIMENSIONS, counts, quantile } from "./grouping";
import { loadCity, type Loaded } from "./data";
import { t } from "./i18n";
import type { Lang, Street } from "./types";

const CITIES = [{ id: "malaga", name: "Málaga" }];
const DIM_LIFT = 900;   // metres a fully-lifted vía floats above the terrain

type Tab = "story" | "lab" | "method";

const TABS: Tab[] = ["story", "lab", "method"];

/** The view is addressable, so a finding can be sent to someone as a link. */
function readHash(): { tab: Tab; lang: Lang | null; street: number | null } {
  const raw = new URLSearchParams(location.hash.replace(/^#/, ""));
  const tab = raw.get("view") as Tab | null;
  const lang = raw.get("lang") as Lang | null;
  const raw_street = raw.get("street");
  const street = raw_street == null ? NaN : Number(raw_street);
  return {
    tab: tab && TABS.includes(tab) ? tab : "story",
    lang: lang === "en" || lang === "es" ? lang : null,
    street: Number.isInteger(street) && street >= 0 ? street : null,
  };
}

const INITIAL: ViewState = {
  axisId: "cat",
  liftId: null,
  hidden: new Set<string>(),
  search: "",
  onlyMapped: true,
  exaggeration: 2.2,
  lineWidth: 1.7,
};

export default function App() {
  const initial = readHash();
  const [lang, setLang] = useState<Lang>(initial.lang ?? "es");
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [cityId, setCityId] = useState(CITIES[0].id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL);
  const [splitId, setSplitId] = useState("gender");
  const [selected, setSelected] = useState<number | null>(initial.street);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setError(null);
    loadCity(cityId)
      .then((l) => { if (live) setLoaded(l); })
      .catch((e) => { if (live) setError(String(e?.message ?? e)); });
    return () => { live = false; };
  }, [cityId]);

  useEffect(() => {
    const next = `#view=${tab}&lang=${lang}`
      + (selected != null ? `&street=${selected}` : "");
    if (location.hash !== next) history.replaceState(null, "", next);
  }, [tab, lang, selected]);

  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      setTab(h.tab);
      if (h.lang) setLang(h.lang);
      setSelected(h.street);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t("title", lang)} — ${loaded?.data.city.name ?? ""}`.trim();
  }, [lang, loaded]);

  const axis = AXES.find((a) => a.id === view.axisId)!;
  const data = loaded?.data;

  const legend = useMemo(
    () => (data ? counts(data.streets, axis, data, lang) : []),
    [data, axis, lang],
  );

  const filtered = useMemo(
    () => (data ? applyFilters(data.streets, view, axis) : []),
    [data, view, axis],
  );
  const visible = useMemo(() => new Set(filtered.map((s) => s.i)), [filtered]);

  // Normalise the lift dimension over the middle of its range, so a single
  // very long street does not flatten everything else onto the terrain.
  const liftScale = useMemo(() => {
    if (!data || !view.liftId) return null;
    const dim = DIMENSIONS.find((d) => d.id === view.liftId);
    if (!dim) return null;
    const vals = data.streets
      .map((s) => dim.value(s))
      .filter((v): v is number => v != null && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (vals.length < 8) return null;
    const lo = quantile(vals, 0.02);
    const hi = quantile(vals, 0.98);
    return { dim, lo, hi: hi > lo ? hi : lo + 1 };
  }, [data, view.liftId]);

  const spec: StyleSpec = useMemo(() => ({
    colour: (s: Street) => {
      const key = axis.key(s);
      return key == null
        ? "#5b6473"
        : axis.meta(key, data!.taxonomy, lang).colour;
    },
    visible: (s: Street) => visible.has(s.i),
    lift: (s: Street) => {
      if (!liftScale) return 0;
      const v = liftScale.dim.value(s);
      if (v == null || !Number.isFinite(v)) return 0;
      return (v - liftScale.lo) / (liftScale.hi - liftScale.lo);
    },
    weight: (s: Street) => Math.min(Math.max(s.importance, 0), 1),
  }), [axis, data, lang, visible, liftScale]);

  const settings = useMemo(() => ({
    exaggeration: view.exaggeration,
    lineWidth: view.lineWidth,
    liftScale: liftScale ? DIM_LIFT : 0,
  }), [view.exaggeration, view.lineWidth, liftScale]);

  const inputs = useMemo(
    () => (loaded ? {
      terrain: loaded.terrain,
      heights: loaded.heights,
      geometry: loaded.geometry,
      streets: loaded.data.streets,
      centre: loaded.data.city.centre,
    } : null),
    [loaded],
  );

  const handlePick = useCallback((i: number | null) => setSelected(i), []);
  const handleHover = useCallback((i: number | null) => setHovered(i), []);

  const active = selected != null && data ? data.streets[selected] : null;
  const hoveredStreet = hovered != null && data ? data.streets[hovered] : null;

  if (error) {
    return <div className="splash">{error}</div>;
  }
  if (!loaded || !data || !inputs) {
    return <div className="splash">{t("loading", lang)}</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>{t("title", lang)}</h1>
          <span className="tagline">{t("tagline", lang)}</span>
        </div>
        <div className="spacer" />
        <select
          className="city-pick" value={cityId}
          onChange={(e) => setCityId(e.target.value)} aria-label="City"
        >
          {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="tabs" role="tablist">
          {([["story", "tabStory"], ["lab", "tabLab"], ["method", "tabMethod"]] as const)
            .map(([id, key]) => (
              <button
                key={id} role="tab" aria-selected={tab === id}
                onClick={() => setTab(id as Tab)}
              >
                {t(key, lang)}
              </button>
            ))}
        </div>
        <div className="langs">
          {(["es", "en"] as Lang[]).map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <div className={`body${tab === "lab" ? " wide" : ""}`}>
        <Controls
          data={data} lang={lang} view={view} setView={setView}
          legend={legend} shown={filtered.length} total={data.streets.length}
        />

        <main className="stage">
          <MapCanvas
            inputs={inputs} settings={settings} spec={spec}
            highlight={hovered ?? selected}
            onPick={handlePick} onHover={handleHover}
          />
          <div className="hint">{t("drag", lang)}</div>
          {hoveredStreet && (
            <HoverTag street={hoveredStreet} lang={lang} />
          )}
        </main>

        <div style={{ display: "contents" }}>
          {tab === "story" && (
            <div className="panel" style={{ padding: 0 }}>
              {active && (
                <div style={{ padding: "18px 18px 0" }}>
                  <StreetCard street={active} data={data} lang={lang}
                    onClose={() => setSelected(null)} />
                </div>
              )}
              <StoryPanel data={data} streets={filtered} lang={lang} />
            </div>
          )}
          {tab === "lab" && (
            <div className="panel" style={{ padding: 0 }}>
              {active && (
                <div style={{ padding: "18px 18px 0" }}>
                  <StreetCard street={active} data={data} lang={lang}
                    onClose={() => setSelected(null)} />
                </div>
              )}
              <WorkbenchPanel
                data={data} streets={filtered} lang={lang}
                splitId={splitId} setSplitId={setSplitId}
                onSelect={(i) => setSelected(i)}
              />
            </div>
          )}
          {tab === "method" && <MethodPanel data={data} lang={lang} />}
        </div>
      </div>
    </div>
  );
}

/** A quiet label that follows the pointer over the scene. */
function HoverTag({ street, lang }: { street: Street; lang: Lang }) {
  return (
    <div className="tip" style={{ left: 16, top: 16 }}>
      <div className="n">{street.kindLabel} {street.name}</div>
      <div className="m">
        {street.why || t("designatum", lang)}
      </div>
    </div>
  );
}
