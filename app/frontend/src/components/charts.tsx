import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

/** Width of an element, following resizes (charts draw in real pixels so text isn't stretched). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** 3–5 round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) {
    const v = Number.isFinite(min) ? min : 0;
    return v === 0 ? [0, 1] : [Math.floor(v * 0.9), Math.ceil(v * 1.1)];
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const DAY = 86_400_000;
const toTime = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

export interface Point {
  date: string;
  value: number;
}

/**
 * One series over time: 2px line, a 10% wash, the latest value labelled at
 * the end, and a crosshair + readout on hover / tap.
 */
export function LineChart(props: {
  points: Point[];
  color: string;
  format: (v: number) => string;
  formatDate: (iso: string) => string;
  formatTick: (iso: string) => string;
  label: string;
  height?: number;
}) {
  const { points, color, format } = props;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const height = props.height ?? 220;
  const pad = { top: 16, right: 56, bottom: 26, left: 40 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;

  if (points.length === 0) return <div ref={ref} className="chart-empty muted small" />;
  const t0 = toTime(points[0].date);
  const t1 = Math.max(toTime(points[points.length - 1].date), t0 + DAY);
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const x = (iso: string) => pad.left + ((toTime(iso) - t0) / (t1 - t0)) * w;
  const y = (v: number) => pad.top + h - ((v - y0) / (y1 - y0 || 1)) * h;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(points[points.length - 1].date).toFixed(1)},${pad.top + h}L${x(points[0].date).toFixed(1)},${pad.top + h}Z`;

  // ~4 date labels, evenly spread
  const xTicks =
    points.length === 1
      ? [points[0].date]
      : [0, 1, 2, 3].map((i) => new Date(t0 + ((t1 - t0) * i) / 3).toISOString().slice(0, 10));

  function onMove(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + pad.left;
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    setHover(best);
  }

  const last = points[points.length - 1];
  const active = hover !== undefined ? points[hover] : undefined;

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={props.label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} />
              <text className="tick" x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((d, i) => (
            <text
              key={i}
              className="tick"
              x={x(d)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            >
              {props.formatTick(d)}
            </text>
          ))}
          <path d={area} style={{ fill: color, opacity: 0.1 }} />
          <path
            d={line}
            fill="none"
            style={{ stroke: color }}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.length < 40 &&
            points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={2.5} style={{ fill: color }} />)}
          <circle cx={x(last.date)} cy={y(last.value)} r={4} style={{ fill: color }} className="ring" />
          {!active && (
            <text className="end-label" x={x(last.date) + 8} y={y(last.value)} dy="0.32em">
              {format(last.value)}
            </text>
          )}
          {active && (
            <g pointerEvents="none">
              <line className="crosshair" x1={x(active.date)} x2={x(active.date)} y1={pad.top} y2={pad.top + h} />
              <circle cx={x(active.date)} cy={y(active.value)} r={5} style={{ fill: color }} className="ring" />
            </g>
          )}
          <rect
            x={pad.left}
            y={pad.top}
            width={w}
            height={h}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(undefined)}
          />
        </svg>
      )}
      {active && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(x(active.date), 70), width - 70), top: 0 } as CSSProperties}
        >
          <span className="muted small">{props.formatDate(active.date)}</span>
          <strong>{format(active.value)}</strong>
        </div>
      )}
    </div>
  );
}

/** Columns for a short run of counts (e.g. workouts per week), value on each cap. */
export function Columns(props: {
  items: { key: string; value: number; label: string; title: string }[];
  color: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 150;
  const pad = { top: 18, bottom: 22 };
  const max = Math.max(1, ...props.items.map((i) => i.value));
  const slot = props.items.length ? width / props.items.length : 0;
  const bw = Math.min(24, slot * 0.6);
  const h = height - pad.top - pad.bottom;
  return (
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={props.ariaLabel}>
          <line className="grid" x1={0} x2={width} y1={pad.top + h} y2={pad.top + h} />
          {props.items.map((item, i) => {
            const cx = slot * i + slot / 2;
            const bh = (item.value / max) * h;
            const top = pad.top + h - bh;
            const r = Math.min(4, bh);
            return (
              <g key={item.key}>
                <title>{item.title}</title>
                {item.value > 0 && (
                  <path
                    d={`M${cx - bw / 2},${pad.top + h}V${top + r}q0,-${r} ${r},-${r}H${cx + bw / 2 - r}q${r},0 ${r},${r}V${pad.top + h}Z`}
                    style={{ fill: props.color }}
                  />
                )}
                <text className="cap" x={cx} y={top - 5} textAnchor="middle">
                  {item.value}
                </text>
                {item.label && (
                  // Edge labels hug the edge so they aren't cut off.
                  <text
                    className="tick"
                    x={i === 0 ? slot * i + 2 : i === props.items.length - 1 ? slot * (i + 1) - 2 : cx}
                    y={height - 6}
                    textAnchor={i === 0 ? "start" : i === props.items.length - 1 ? "end" : "middle"}
                  >
                    {item.label}
                  </text>
                )}
                <rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Horizontal bars with the label and value as text beside them (colour is never the only cue). */
export function Bars(props: {
  rows: { key: string; label: string; value: number; text: string; className: string }[];
}) {
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  return (
    <ul className="bars">
      {props.rows.map((r) => (
        <li key={r.key} className={r.className}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(100 * r.value) / max}%` }} />
          </span>
          <span className="bar-value">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function Tile(props: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="tile">
      <span className="tile-label">{props.label}</span>
      <span className="tile-value">{props.value}</span>
      {props.note && <span className="tile-note">{props.note}</span>}
    </div>
  );
}
