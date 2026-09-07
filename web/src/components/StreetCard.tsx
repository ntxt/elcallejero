import { AXES, RULE_LABEL } from "../grouping";
import { nfmt, t } from "../i18n";
import type { Dataset, Lang, Street } from "../types";

const KM = (v: number, lang: Lang) =>
  v >= 1000 ? `${(v / 1000).toLocaleString(lang === "es" ? "es-ES" : "en-GB",
    { maximumFractionDigits: 2 })} km` : `${Math.round(v)} m`;

export function StreetCard({
  street, data, lang, onClose,
}: {
  street: Street;
  data: Dataset;
  lang: Lang;
  onClose: () => void;
}) {
  const tx = data.taxonomy;
  const cat = tx.categories[street.cat];
  const sub = cat?.sub[street.sub];
  const gender = tx.genders[street.gender];
  const es = lang === "es";

  return (
    <div className="detail-card">
      <div style={{ display: "flex", alignItems: "start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{street.name}</h3>
          <div className="kindline">
            {street.kindLabel}
            {street.barrio ? ` · ${street.barrio}` : ""}
          </div>
        </div>
        <button className="btn" onClick={onClose} aria-label={t("close", lang)}>×</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className="chip">
          <span className="dot" style={{ background: cat?.colour ?? "#8b9199" }} />
          {cat?.[lang] ?? street.cat}
          {sub ? ` · ${sub[lang]}` : ""}
        </span>
        {street.gender !== "none" && (
          <span className="chip">
            <span className="dot" style={{ background: gender?.colour ?? "#8b9199" }} />
            {gender?.[lang] ?? street.gender}
          </span>
        )}
      </div>

      {street.why && (
        <p className="note" style={{ marginTop: 12 }}>
          <b>{t("evidence", lang)}:</b> {street.why}
          <br />
          <span style={{ color: "var(--ink-3)" }}>
            {RULE_LABEL[street.rule]?.[lang] ?? street.rule}
            {" · "}
            {es ? "confianza" : "confidence"} {street.conf.toFixed(2)}
          </span>
        </p>
      )}

      {street.contested && (
        <div className="warn">
          <b>{t("contested", lang)}.</b> {t("contestedHelp", lang)}
          {street.alt?.length ? (
            <div style={{ marginTop: 6 }}>
              {t("alsoReads", lang)}:{" "}
              {street.alt.map((a) => tx.categories[a.cat]?.[lang] ?? a.cat).join(", ")}.
            </div>
          ) : null}
        </div>
      )}

      <dl className="kv">
        {street.district && (<><dt>{t("district", lang)}</dt><dd>{street.district}</dd></>)}
        {street.year != null && (
          <>
            <dt>{t("registered", lang)}</dt>
            <dd>
              {street.year}
              {street.yearEst && (
                <span style={{ color: "var(--ink-3)" }}> · {t("estimated", lang)}</span>
              )}
            </dd>
          </>
        )}
        {street.mapped ? (
          <>
            <dt>{AXES.length ? (es ? "Longitud" : "Length") : ""}</dt>
            <dd>{KM(street.length, lang)}</dd>
            {street.width != null && (<><dt>{es ? "Anchura" : "Width"}</dt><dd>{street.width.toFixed(1)} m</dd></>)}
            {street.connections != null && (
              <><dt>{es ? "Conexiones" : "Connections"}</dt><dd>{nfmt(street.connections, lang)}</dd></>
            )}
            {street.distCentre != null && (
              <><dt>{es ? "Al centro" : "From centre"}</dt><dd>{KM(street.distCentre, lang)}</dd></>
            )}
            <dt>{es ? "Prominencia" : "Prominence"}</dt>
            <dd>{street.importance.toFixed(3)}</dd>
          </>
        ) : (
          <><dt>—</dt><dd style={{ color: "var(--ink-3)" }}>{t("notMapped", lang)}</dd></>
        )}
      </dl>
    </div>
  );
}
