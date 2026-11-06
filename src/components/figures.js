import React from "react";
import { fromApiDate } from "../api/analytics";
import Icon from "./Icon";

/**
 * The pieces every sales-figure page shares - the dashboard and the company / item drill-downs - so
 * an amount, a date, a headline tile or the range filter looks and behaves the same on all of them.
 * Styles live in pages/home/home.css (the pages using these wrap themselves in `.home`).
 */

/** Presets for the date filter. Ranges end today and include it. */
export const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
];

export const DEFAULT_RANGE = "30d";

export function findRange(key) {
  return RANGES.find((r) => r.key === key) || RANGES.find((r) => r.key === DEFAULT_RANGE);
}

/**
 * [from, to] for a preset, ending today. "Today" is read on every call, so a page left open past
 * midnight moves its range along on the next load.
 */
export function rangeDates(range) {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - (range.days - 1));
  return { from, to };
}

const money = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-MY", { notation: "compact", maximumFractionDigits: 1 });
const qty = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });

/** Local-currency amounts. Companies on the platform are Malaysian, and the figures are copied in local currency. */
export function formatAmount(value, short = false) {
  const v = Number(value) || 0;
  // Axis ticks: compact from 1,000 up, so one axis never mixes "RM 20K" with "RM 5,000".
  if (short) return `RM ${Math.abs(v) >= 1000 ? compact.format(v) : qty.format(v)}`;
  return `RM ${money.format(v)}`;
}

export function formatQuantity(value) {
  return qty.format(Number(value) || 0);
}

const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value, bucket = "day", short = false) {
  const d = fromApiDate(value);
  if (!d) return "";
  if (bucket === "month") return short ? `${monthShort[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${monthShort[d.getMonth()]} ${d.getFullYear()}`;
  return short ? `${d.getDate()} ${monthShort[d.getMonth()]}` : `${d.getDate()} ${monthShort[d.getMonth()]} ${d.getFullYear()}`;
}

/** "just now" / "6 min ago" / "3 h ago", then the date. Null for no value. */
export function formatWhen(value) {
  const d = fromApiDate(value);
  if (!d) return null;
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return formatDate(value, "day", false);
}

/**
 * Change against the previous period of the same length. Up is good for every figure these pages
 * show, so direction alone decides the colour - and it always comes with an arrow and the words,
 * never colour alone.
 */
export function Delta({ current, previous, label }) {
  if (!previous) {
    return (
      <div className="kpi-delta kpi-delta-flat">
        <span>{current ? `New vs ${label}` : `No change vs ${label}`}</span>
      </div>
    );
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0)
    return (
      <div className="kpi-delta kpi-delta-flat">
        <span>No change vs {label}</span>
      </div>
    );

  const up = rounded > 0;
  return (
    <div className={up ? "kpi-delta kpi-delta-up" : "kpi-delta kpi-delta-down"}>
      <span>
        <span aria-hidden="true">{up ? "▲" : "▼"}</span> {up ? "+" : ""}
        {rounded.toLocaleString("en-MY")}% vs {label}
      </span>
    </div>
  );
}

/**
 * A headline figure on a tile washed in its tone, the figure in the tone's dark ink. `icon` is an
 * Icon name (components/Icon.js).
 * With `previous` it shows the change against the previous period; without, `note` (a figure that
 * has no "previous", like stock on hand) or nothing.
 */
export function Kpi({ label, value, current, previous, periodLabel, icon, tone, note }) {
  return (
    // The icon shares the LABEL's row, so the figure gets the tile's full width - beside the icon,
    // "RM 4,970.00" truncated on a laptop screen.
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-head">
        <div className="kpi-icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </div>
        <div className="kpi-label">{label}</div>
      </div>
      <div className="kpi-value">{value}</div>
      {previous !== undefined ? (
        <Delta current={current} previous={previous} label={periodLabel} />
      ) : (
        note && (
          <div className="kpi-delta kpi-delta-flat">
            <span>{note}</span>
          </div>
        )
      )}
    </div>
  );
}

/** The preset range buttons. One filter row above everything it scopes. */
export function RangeButtons({ value, onChange }) {
  return (
    <div className="home-range" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          className={r.key === value ? "home-range-btn home-range-btn-on" : "home-range-btn"}
          aria-pressed={r.key === value}
          onClick={() => onChange(r.key)}
        >
          {r.key === value && <Icon className="home-range-check" name="check" size={14} strokeWidth={2.4} />}
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A card's heading: its icon on a tinted tile (`tone`: green, amber, purple, pink, blue...), the
 * title and a line under it. `children` go on the right - a toggle or a link.
 */
export function CardHead({ icon, tone, title, sub, children }) {
  return (
    <div className="card-head">
      <div className="card-head-main">
        {icon && (
          <span className={`card-icon app-tone-${tone}`}>
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="card-head-text">
          <h2 className="card-title">{title}</h2>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
