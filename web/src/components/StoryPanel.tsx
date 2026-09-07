import { useMemo, useState } from "react";
import { BarChart, RangeChart, Split, TimeSeries } from "./charts";
import { AXES, DIMENSIONS, summarise } from "../grouping";
import { nfmt, pct, t } from "../i18n";
import type { Dataset, Lang, Street } from "../types";

const GENDER_AXIS = AXES.find((a) => a.id === "gender")!;

export function StoryPanel({
  data, streets, lang,
}: {
  data: Dataset;
  streets: Street[];
  lang: Lang;
}) {
  const tx = data.taxonomy;
  const [dimId, setDimId] = useState("importance");
  const dim = DIMENSIONS.find((d) => d.id === dimId)!;

  const gap = useMemo(() => {
    let women = 0, men = 0, mixed = 0;
    for (const s of data.streets) {
      if (s.gender === "f") women++;
      else if (s.gender === "m") men++;
      else if (s.gender === "mixed") mixed++;
    }
    const gendered = women + men + mixed;
    return { women, men, mixed, gendered, share: gendered ? (women / gendered) * 100 : 0 };
  }, [data.streets]);

  const genderRanges = useMemo(
    () => summarise(data.streets.filter((s) => s.gender === "f" || s.gender === "m"),
      GENDER_AXIS, dim, data, lang),
    [data, dim, lang],
  );

  const professions = useMemo(() => {
    const raw = data.thesis?.current.by_profession ?? {};
    return Object.entries(raw).slice(0, 12).map(([k, v]) => ({
      key: k,
      label: k.charAt(0).toUpperCase() + k.slice(1),
      colour: tx.genders.f.colour,
      value: v,
    }));
  }, [data.thesis, tx]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data.streets) counts.set(s.cat, (counts.get(s.cat) ?? 0) + 1);
    return Object.keys(tx.categories)
      .filter((k) => counts.has(k))
      .map((k) => ({
        key: k, label: tx.categories[k][lang], colour: tx.categories[k].colour,
        value: counts.get(k)!,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data.streets, tx, lang]);

  const series = data.thesis?.series ?? [];
  const scale = useMemo(() => {
    const vals = genderRanges.flatMap((g) => [g.min, g.max]);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] as const : [0, 1] as const;
  }, [genderRanges]);

  return (
    <div className="panel">
      <h2>{t("gapHeadline", lang)}</h2>
      <p className="lead">{t("gapLead", lang)}</p>

      <section>
        <div className="hero">
          <span className="big">{pct(gap.share, lang)}</span>
          <span className="unit">
            {nfmt(gap.women, lang)} {t("women", lang)} · {nfmt(gap.men, lang)} {t("men", lang)}
          </span>
        </div>
        <Split
          parts={[
            { label: tx.genders.f[lang], value: gap.women, colour: tx.genders.f.colour },
            { label: tx.genders.m[lang], value: gap.men, colour: tx.genders.m.colour },
            ...(gap.mixed
              ? [{ label: tx.genders.mixed[lang], value: gap.mixed, colour: tx.genders.mixed.colour }]
              : []),
          ]}
          format={(v) => nfmt(v, lang)}
        />
        {data.thesis && (
          <p className="note">
            {lang === "es"
              ? <>La tesis contabiliza <b>{nfmt(data.thesis.current.total, lang)}</b> vías dedicadas a mujeres y <b>{nfmt(data.thesis.men_2022, lang)}</b> a hombres en el callejero de 2022. Esta plataforma cuenta <b>{nfmt(gap.women, lang)}</b> y <b>{nfmt(gap.men, lang)}</b>: clasifica todas las vías vigentes, incluidas las del suelo rústico, y cuenta como femeninas las santas y advocaciones que la tesis desglosa aparte.</>
              : <>The thesis counts <b>{nfmt(data.thesis.current.total, lang)}</b> ways dedicated to women and <b>{nfmt(data.thesis.men_2022, lang)}</b> to men in the 2022 callejero. This platform counts <b>{nfmt(gap.women, lang)}</b> and <b>{nfmt(gap.men, lang)}</b>: it classifies every way still on the register, rural holdings included, and counts saints and Marian titles as female where the thesis lists them separately.</>}
          </p>
        )}
      </section>

      {series.length > 0 && (
        <section>
          <h3>{t("timeline", lang)}</h3>
          <p className="sub">{t("timelineLead", lang)}</p>
          <TimeSeries
            points={series.map((s) => ({ x: s.year, y: s.women, note: s.model[lang] }))}
            colour={tx.genders.f.colour}
            format={(v) => nfmt(v, lang)}
          />
          <div className="stat-row">
            {series.map((s) => (
              <div className="stat" key={s.year}>
                <div className="v">{nfmt(s.women, lang)}</div>
                <div className="k">{s.year} · {s.model[lang]}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {professions.length > 0 && (
        <section>
          <h3>{t("whoAreThey", lang)}</h3>
          <p className="sub">{t("whoLead", lang)}</p>
          <BarChart data={professions} format={(v) => nfmt(v, lang)} />
        </section>
      )}

      <section>
        <h3>{t("notJustHowMany", lang)}</h3>
        <p className="sub">{t("notJustLead", lang)}</p>
        <div className="field">
          <select value={dimId} onChange={(e) => setDimId(e.target.value)}
            aria-label={t("dimension", lang)}>
            {DIMENSIONS.map((d) => (
              <option key={d.id} value={d.id}>{d.label[lang]}</option>
            ))}
          </select>
        </div>
        {genderRanges.length >= 2 ? (
          <>
            <RangeChart
              data={genderRanges} format={(v) => dim.format(v, lang)}
              scaleMin={scale[0]} scaleMax={scale[1]} log={dim.log}
              unit={dim.unit[lang]}
            />
            <p className="footnote" style={{ marginTop: 6 }}>
              {t("median", lang)}: {genderRanges.map((g) =>
                `${g.label} ${dim.format(g.median, lang)}`).join(" · ")}
            </p>
            {dim.summable && genderRanges.length >= 2 && (() => {
              // The medians are close, so the gap is one of number rather than
              // of size -- which the totals show and the medians hide.
              const fmt = dim.formatTotal ?? dim.format;
              const sum = genderRanges.reduce((a, g) => a + g.total, 0);
              const women = genderRanges.find((g) => g.key === "f");
              return (
                <p className="note">
                  <b>{t("howMuchStreet", lang)}.</b>{" "}
                  {genderRanges.map((g) =>
                    `${g.label} ${fmt(g.total, lang)}`).join(" · ")}
                  {women && (
                    <>
                      {" — "}
                      {lang === "es"
                        ? <>las mujeres son el <b>{pct((women.total / sum) * 100, lang)}</b> de esa
                          longitud y el <b>{pct((women.n / genderRanges.reduce((a, g) => a + g.n, 0)) * 100, lang)}</b> de
                          las vías: la diferencia está en cuántas, no en cuán grandes.</>
                        : <>women account for <b>{pct((women.total / sum) * 100, lang)}</b> of that
                          length and <b>{pct((women.n / genderRanges.reduce((a, g) => a + g.n, 0)) * 100, lang)}</b> of
                          the ways: the gap is in how many, not how big.</>}
                    </>
                  )}
                </p>
              );
            })()}
          </>
        ) : <p className="empty">{t("noData", lang)}</p>}
        {dim.note && <p className="note">{dim.note[lang]}</p>}
      </section>

      <section>
        <h3>{t("everythingElse", lang)}</h3>
        <p className="sub">{t("everythingLead", lang)}</p>
        <BarChart data={categories} format={(v) => nfmt(v, lang)} />
      </section>

      <p className="footnote">
        {streets.length !== data.streets.length && (
          <>
            {lang === "es"
              ? "Las cifras de esta sección describen el callejero completo, no el filtro activo."
              : "The figures in this section describe the whole callejero, not the active filter."}
            <br /><br />
          </>
        )}
        {data.thesis && (
          <>
            {data.thesis.source} ·{" "}
            <a href={data.thesis.handle} target="_blank" rel="noreferrer noopener">
              {data.thesis.handle}
            </a>
          </>
        )}
      </p>
    </div>
  );
}
