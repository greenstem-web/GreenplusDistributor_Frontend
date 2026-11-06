import React, { useMemo, useRef, useState } from "react";
import { MALAYSIA_STATES, MALAYSIA_VIEWBOX } from "./malaysiaStates";

/**
 * One sequential hue, light -> dark, for "how much": the dashboard's green, five steps. Every step
 * is a distinct lightness, so the order reads without colour vision; a state with no sales is a
 * neutral grey, not the lightest green, so "none" never looks like "a little".
 */
const STEPS = ["#d7f0dd", "#a6dcb4", "#6fc285", "#3c9f58", "#1f7a3c"];
const NO_SALES = "#eceef1";

/** Shapes smaller than this (viewBox units) get a marker you can actually point at. */
const SMALL = 10;

/**
 * Where a small shape's marker sits, as an offset from the shape (viewBox units), and its label.
 * Kuala Lumpur and Putrajaya are ~25 km apart inside Selangor - their markers would sit on top of
 * each other - so they are drawn out into the Strait of Malacca on a leader line. Labuan is an
 * island already clear of Sabah's coast.
 */
const MARKERS = {
  14: { dx: -46, dy: -12, label: "KL" },
  16: { dx: -46, dy: 12, label: "Putrajaya" },
  15: { dx: 0, dy: 0, label: "Labuan" },
};

const qty = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });

/** Equal steps of the largest area's amount - with a handful of areas, quantiles would be noise. */
function stepOf(amount, max) {
  if (!(amount > 0) || !(max > 0)) return -1;
  return Math.min(STEPS.length - 1, Math.floor((amount / max) * STEPS.length - 1e-9));
}

function Change({ current, previous, label }) {
  if (!previous) return <span className="map-tip-muted">{current ? `New vs ${label}` : `No sales in ${label} either`}</span>;
  const change = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  if (change === 0) return <span className="map-tip-muted">No change vs {label}</span>;
  return (
    <span className={change > 0 ? "map-tip-up" : "map-tip-down"}>
      <span aria-hidden="true">{change > 0 ? "▲" : "▼"}</span> {change > 0 ? "+" : ""}
      {change.toLocaleString("en-MY")}% vs {label}
    </span>
  );
}

/**
 * Sales by area: Malaysia's states shaded by net sales in the period, beside the same figures as a
 * ranked list. The area is each company's state from its own Company Profile (copied by the job).
 * Hovering a state - on the map or in the list - highlights it in both and shows its figures.
 * Companies with no state yet are not on the map; the list and a note say how much that is.
 */
export default function SalesAreaMap({ areas, formatAmount, periodLabel }) {
  const wrap = useRef(null);
  const [active, setActive] = useState(null); // state code, or "" for "Not set"
  const [tip, setTip] = useState(null); // { x, y } within the map

  const byCode = useMemo(() => {
    const map = new Map();
    for (const a of areas || []) if (a.stateCode) map.set(a.stateCode, a);
    return map;
  }, [areas]);

  const notSet = (areas || []).find((a) => !a.stateCode);
  const max = Math.max(0, ...(areas || []).filter((a) => a.stateCode).map((a) => a.amount));
  const listed = (areas || []).filter((a) => a.amount !== 0 || a.previousAmount !== 0);
  // Shares are of the areas that sold - one in credit notes takes no share, rather than a negative one.
  const totalSales = (areas || []).reduce((sum, a) => sum + Math.max(0, a.amount), 0);

  const show = (code, event) => {
    setActive(code);
    if (event && wrap.current) {
      const box = wrap.current.getBoundingClientRect();
      setTip({ x: event.clientX - box.left, y: event.clientY - box.top });
    }
  };
  const hide = () => {
    setActive(null);
    setTip(null);
  };

  const activeArea = active === "" ? notSet : active ? byCode.get(active) || { stateCode: active, area: nameOf(active), amount: 0, previousAmount: 0, companies: 0 } : null;

  // Legend bands: the upper bound of each step.
  const bands = STEPS.map((color, i) => ({ color, upTo: (max * (i + 1)) / STEPS.length }));

  return (
    <div className="map-layout">
      <div className="map-figure" ref={wrap} onPointerLeave={hide}>
        <svg viewBox={MALAYSIA_VIEWBOX} className="map-svg" role="img" aria-label="Net sales by state, shaded darker for more sales.">
          {MALAYSIA_STATES.map((s) => {
            const area = byCode.get(s.code);
            const step = stepOf(area?.amount, max);
            return (
              <path
                key={s.code}
                d={s.path}
                className={"map-state" + (active === s.code ? " map-state-on" : "")}
                fill={step < 0 ? NO_SALES : STEPS[step]}
                tabIndex={0}
                aria-label={`${s.name}: ${area ? formatAmount(area.amount) : "no sales"}`}
                onPointerMove={(e) => show(s.code, e)}
                onFocus={() => show(s.code, null)}
                onBlur={hide}
              />
            );
          })}
          {/* The federal territories are a few pixels across - a marker gives them a target. */}
          {MALAYSIA_STATES.filter((s) => Math.min(s.w, s.h) < SMALL).map((s) => {
            const area = byCode.get(s.code);
            const step = stepOf(area?.amount, max);
            const m = MARKERS[s.code] || { dx: 0, dy: 0, label: s.name };
            const x = s.cx + m.dx;
            const y = s.cy + m.dy;
            const leftward = m.dx < 0;
            return (
              <g key={"m" + s.code} aria-hidden="true" onPointerMove={(e) => show(s.code, e)}>
                {(m.dx !== 0 || m.dy !== 0) && <line className="map-leader" x1={s.cx} y1={s.cy} x2={x} y2={y} />}
                <circle
                  cx={x}
                  cy={y}
                  r={8}
                  className={"map-marker" + (active === s.code ? " map-state-on" : "")}
                  fill={step < 0 ? NO_SALES : STEPS[step]}
                />
                <text className="map-marker-label" x={leftward ? x - 13 : x + 13} y={y} textAnchor={leftward ? "end" : "start"} dy="0.35em">
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>

        {activeArea && (
          <div
            className="map-tip"
            role="status"
            style={
              tip
                ? { left: tip.x, top: tip.y, transform: `translate(${tip.x > (wrap.current?.clientWidth || 0) * 0.6 ? "calc(-100% - 14px)" : "14px"}, -50%)` }
                : { left: 12, top: 12 }
            }
          >
            <div className="map-tip-title">{activeArea.area}</div>
            <div className="map-tip-row">
              <strong>{formatAmount(activeArea.amount)}</strong> net sales
            </div>
            {activeArea.amount !== 0 && (
              <div className="map-tip-row">
                qty {qty.format(activeArea.quantity)} · {activeArea.companies} compan{activeArea.companies === 1 ? "y" : "ies"}
              </div>
            )}
            <div className="map-tip-row">
              <Change current={activeArea.amount} previous={activeArea.previousAmount} label={periodLabel} />
            </div>
          </div>
        )}

        <div className="map-legend" aria-hidden="true">
          <span className="map-legend-item">
            <span className="map-swatch" style={{ background: NO_SALES }} /> No sales
          </span>
          {max > 0 &&
            bands.map((b, i) => (
              <span className="map-legend-item" key={b.color}>
                <span className="map-swatch" style={{ background: b.color }} />
                {i === bands.length - 1 ? `up to ${formatAmount(b.upTo, true)}` : formatAmount(b.upTo, true)}
              </span>
            ))}
        </div>
      </div>

      {/* The same figures as a list: every value without hovering, and the areas the map cannot show.
          Each area's bar is its share of the period's net sales. */}
      <ol className="map-list" aria-label="Net sales by area">
        {listed.length === 0 && <li className="map-list-empty">No sales in this period.</li>}
        {listed.map((a) => {
          const key = a.stateCode ?? "";
          const share = totalSales > 0 ? Math.max(0, a.amount) / totalSales : 0;
          return (
            <li
              key={key || "not-set"}
              className={"map-list-row" + (active === key ? " map-list-row-on" : "")}
              onPointerEnter={() => show(key, null)}
              onPointerLeave={hide}
            >
              <div className="map-list-line">
                <span className="map-list-dot" aria-hidden="true" />
                <span className="map-list-name">{a.area}</span>
                <span className="map-list-value">{formatAmount(a.amount)}</span>
              </div>
              <div className="map-list-sub">
                {a.companies} compan{a.companies === 1 ? "y" : "ies"}
                {!a.stateCode ? " · no state in their profile yet" : ""}
              </div>
              {totalSales > 0 && (
                <>
                  <div className="map-share-track" aria-hidden="true">
                    {share > 0 && <div className="map-share-bar" style={{ width: `${(share * 100).toFixed(2)}%` }} />}
                  </div>
                  <div className="map-list-sub">{formatShare(share)} of net sales</div>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {notSet && notSet.amount !== 0 && (
        <div className="map-note">
          {formatAmount(notSet.amount)} is from companies without a state in their Company Profile - not on the map.
        </div>
      )}
    </div>
  );
}

/** "100%", "42%", "0.4%" - a decimal only where a whole number would round a real share to 0. */
function formatShare(share) {
  const pct = share * 100;
  return `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function nameOf(code) {
  return MALAYSIA_STATES.find((s) => s.code === code)?.name || code;
}
