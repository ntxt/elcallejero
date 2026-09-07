import { useId, useLayoutEffect, useRef, useState } from "react";

/* Chart primitives shared by both panels.

   Conventions kept throughout, per the visualization method:
   - one measure per axis, never two scales in a frame;
   - colour carries the entity, so a filter that drops groups never repaints the
     survivors;
   - marks are thin, data-ends are rounded and anchored to the baseline, and
     fills keep a 2px gap of surface between them;
   - every mark has a hover target at least as large as itself;
   - values are direct-labelled selectively, never on every mark. */

const SURFACE = "#161b24";

/**
 * Charts are laid out in real pixels, not in a stretched viewBox.
 *
 * The obvious shortcut -- a fixed 1000-unit viewBox with
 * `preserveAspectRatio="none"` -- scales the drawing to the container for free,
 * but it scales the glyphs with it, so every label ends up horizontally
 * squashed by whatever the container happens to be. Measuring instead costs one
 * ResizeObserver and keeps the type at its true size.
 */
function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface Datum {
  key: string;
  label: string;
  colour: string;
  value: number;
  /** Optional secondary text shown in the tooltip. */
  detail?: string;
}

interface Hover { x: number; y: number; html: React.ReactNode }

function Tooltip({ hover }: { hover: Hover | null }) {
  if (!hover) return null;
  return (
    <div className="tip" style={{ left: hover.x + 12, top: hover.y + 10 }} role="status">
      {hover.html}
    </div>
  );
}

function useHover() {
  const [hover, setHover] = useState<Hover | null>(null);
  const bind = (html: React.ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const box = (e.currentTarget as SVGElement).ownerSVGElement!
        .parentElement!.getBoundingClientRect();
      setHover({ x: e.clientX - box.left, y: e.clientY - box.top, html });
    },
    onMouseLeave: () => setHover(null),
  });
  return { hover, bind, clear: () => setHover(null) };
}

/** Horizontal magnitude bars. One series, so the row labels are the legend. */
export function BarChart({
  data, format, rowHeight = 24, maxRows, onSelect, selected,
}: {
  data: Datum[];
  format: (v: number) => string;
  rowHeight?: number;
  maxRows?: number;
  onSelect?: (key: string) => void;
  selected?: string | null;
}) {
  const { hover, bind } = useHover();
  const [ref, w] = useWidth();
  const rows = maxRows ? data.slice(0, maxRows) : data;
  const height = rows.length * rowHeight;
  const labelW = Math.min(Math.max(w * 0.42, 90), 210);
  const valueW = 56;
  const gap = 2;                       // surface gap between adjacent fills
  const max = Math.max(...rows.map((d) => d.value)) || 1;
  const plotW = Math.max(w - labelW - valueW, 10);

  if (!rows.length) return null;
  return (
    <div style={{ position: "relative" }} ref={ref}>
      {w > 0 && (
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} width={w} height={height} role="img">
        {rows.map((d, i) => {
          const y = i * rowHeight;
          const barW = Math.max((d.value / max) * plotW, 2);
          const dim = selected != null && selected !== d.key;
          return (
            <g
              key={d.key} className="mark"
              opacity={dim ? 0.35 : 1}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={() => onSelect?.(d.key)}
              {...bind(
                <>
                  <div className="n">{d.label}</div>
                  <div className="m">{format(d.value)}{d.detail ? ` · ${d.detail}` : ""}</div>
                </>,
              )}
            >
              <rect x={0} y={y} width={w} height={rowHeight} fill="transparent" />
              <text x={labelW - 10} y={y + rowHeight / 2 + 4} textAnchor="end">
                <title>{d.label}</title>
                {clip(d.label, labelW)}
              </text>
              <rect
                x={labelW} y={y + gap} width={barW} height={rowHeight - gap * 2}
                rx={4} fill={d.colour}
              />
              <text
                className="value" x={labelW + barW + 8} y={y + rowHeight / 2 + 4}
              >
                {format(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
      )}
      <Tooltip hover={hover} />
    </div>
  );
}

/** Trim a label to what will fit, so it never collides with the plot. */
function clip(label: string, px: number): string {
  const max = Math.max(Math.floor((px - 14) / 6.1), 4);
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export interface RangeDatum {
  key: string;
  label: string;
  colour: string;
  n: number;
  min: number; q1: number; median: number; q3: number; max: number;
}

/**
 * Distribution per group: whisker to the 5th/95th, a bar across the
 * interquartile range and a tick at the median. One measure, one axis.
 */
export function RangeChart({
  data, format, scaleMin, scaleMax, log = false, onSelect, selected, unit,
}: {
  data: RangeDatum[];
  format: (v: number) => string;
  scaleMin: number;
  scaleMax: number;
  log?: boolean;
  onSelect?: (key: string) => void;
  selected?: string | null;
  unit?: string;
}) {
  const { hover, bind } = useHover();
  const id = useId();
  const [ref, w] = useWidth();
  const rowHeight = 30;
  const labelW = Math.min(Math.max(w * 0.32, 84), 160);
  const height = data.length * rowHeight + 26;
  const plotW = Math.max(w - labelW - 26, 10);
  if (!data.length) return null;

  const lo = log ? Math.log10(Math.max(scaleMin, 0.5)) : scaleMin;
  const hi = log ? Math.log10(Math.max(scaleMax, 1)) : scaleMax;
  const px = (v: number) => {
    const t = ((log ? Math.log10(Math.max(v, 0.5)) : v) - lo) / (hi - lo || 1);
    return labelW + Math.min(Math.max(t, 0), 1) * plotW;
  };

  const ticks: number[] = [];
  if (log) {
    for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) ticks.push(10 ** e);
  } else {
    for (let k = 0; k <= 4; k++) ticks.push(scaleMin + ((scaleMax - scaleMin) * k) / 4);
  }

  return (
    <div style={{ position: "relative" }} ref={ref}>
      {w > 0 && (
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} width={w} height={height} role="img">
        <g className="grid">
          {ticks.filter((v) => v >= scaleMin && v <= scaleMax).map((v) => (
            <g key={`${id}-${v}`}>
              <line x1={px(v)} x2={px(v)} y1={0} y2={height - 22} strokeWidth={1} />
              <text className="muted" x={px(v)} y={height - 7} textAnchor="middle">
                {format(v)}
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          const y = i * rowHeight + rowHeight / 2 - 4;
          const dim = selected != null && selected !== d.key;
          return (
            <g
              key={d.key} className="mark" opacity={dim ? 0.35 : 1}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={() => onSelect?.(d.key)}
              {...bind(
                <>
                  <div className="n">{d.label}</div>
                  <div className="m">
                    {format(d.median)} {unit ? `${unit} ` : ""}· n={d.n}
                    <br />
                    {format(d.q1)} – {format(d.q3)}
                  </div>
                </>,
              )}
            >
              <rect x={0} y={i * rowHeight} width={w} height={rowHeight} fill="transparent" />
              <text x={labelW - 10} y={y + 4} textAnchor="end">
                <title>{d.label}</title>
                {clip(d.label, labelW)}
              </text>
              <line
                x1={px(d.min)} x2={px(d.max)} y1={y} y2={y}
                stroke={d.colour} strokeWidth={2} strokeOpacity={0.42}
                strokeLinecap="round"
              />
              <rect
                x={px(d.q1)} y={y - 6} width={Math.max(px(d.q3) - px(d.q1), 3)} height={12}
                rx={4} fill={d.colour} fillOpacity={0.68}
              />
              <line
                x1={px(d.median)} x2={px(d.median)} y1={y - 8} y2={y + 8}
                stroke={SURFACE} strokeWidth={4} strokeLinecap="round"
              />
              <line
                x1={px(d.median)} x2={px(d.median)} y1={y - 8} y2={y + 8}
                stroke={d.colour} strokeWidth={2} strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      )}
      <Tooltip hover={hover} />
    </div>
  );
}

/** The three callejeros the thesis compares. Few points, so all are labelled. */
export function TimeSeries({
  points, colour, format,
}: {
  points: { x: number; y: number; note?: string }[];
  colour: string;
  format: (v: number) => string;
}) {
  const { hover, bind } = useHover();
  const [ref, w] = useWidth();
  const h = 190, padX = 46, padTop = 26, padBottom = 34;
  const xs = points.map((p) => p.x);
  const maxY = Math.max(...points.map((p) => p.y)) * 1.18;
  const x = (v: number) =>
    padX + ((v - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1)) * (w - padX * 2);
  const y = (v: number) => h - padBottom - (v / maxY) * (h - padTop - padBottom);

  if (!points.length) return null;
  return (
    <div style={{ position: "relative" }} ref={ref}>
      {w > 0 && (
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img">
        <line className="grid" x1={padX - 12} x2={w - padX + 12}
          y1={h - padBottom} y2={h - padBottom} strokeWidth={1} />
        <path
          d={points.map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.y)}`).join(" ")}
          fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round"
        />
        {points.map((p) => (
          <g key={p.x} className="mark"
            {...bind(<><div className="n">{p.x}</div><div className="m">{format(p.y)}{p.note ? ` · ${p.note}` : ""}</div></>)}>
            <circle cx={x(p.x)} cy={y(p.y)} r={14} fill="transparent" />
            <circle cx={x(p.x)} cy={y(p.y)} r={6} fill={colour}
              stroke={SURFACE} strokeWidth={2} />
            <text className="value" x={x(p.x)} y={y(p.y) - 14} textAnchor="middle">
              {format(p.y)}
            </text>
            <text className="muted" x={x(p.x)} y={h - 12} textAnchor="middle">{p.x}</text>
          </g>
        ))}
      </svg>
      )}
      <Tooltip hover={hover} />
    </div>
  );
}

/** A single proportion, shown as one bar split in two. Legend is direct. */
export function Split({
  parts, format,
}: {
  parts: { label: string; value: number; colour: string }[];
  format: (v: number) => string;
}) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  const [ref, cw] = useWidth();
  let x = 0;
  return (
    <div ref={ref}>
      {cw > 0 && (
      <svg className="chart" viewBox={`0 0 ${cw} 26`} width={cw} height={26} role="img">
        {parts.map((p, i) => {
          const w = (p.value / total) * cw;
          const seg = (
            <rect
              key={p.label}
              x={x + (i ? 2 : 0)} y={0}
              width={Math.max(w - (i ? 2 : 0), 1)} height={26}
              rx={4} fill={p.colour}
            />
          );
          x += w;
          return seg;
        })}
      </svg>
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {parts.map((p) => (
          <span key={p.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.colour }} />
            <span style={{ color: "var(--ink-2)" }}>{p.label}</span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{format(p.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
