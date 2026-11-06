import React from "react";
import { Link } from "react-router-dom";

/**
 * A ranked list as thin bars on a grey track: one colour for every bar (`tone` - the card's own),
 * since items and companies have no order of their own and darker-for-bigger would only repeat the
 * length. The value is in text ink, never the bar colour.
 *
 * `layout`:
 * - "columns" - name | bar | value on one line (Top items: short codes, many rows);
 * - "stacked" - name and value on top, the detail under it, the bar full width below (Top companies:
 *   long names that need the whole width).
 *
 * Plain HTML rather than SVG: long names wrap and truncate the way text should, and a screen reader
 * reads each row as a row. A row with `to` links its name there (the company or item drill-down).
 */
export default function RankBars({ rows, formatValue, emptyText, tone = "green", layout = "columns" }) {
  if (!rows.length) return <div className="rank-empty">{emptyText}</div>;

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;

  return (
    <ol className={`rank rank-${layout} rank-tone-${tone}`}>
      {rows.map((row) => {
        const pct = Math.max(0, Math.min(100, (row.value / max) * 100));
        const name = row.to ? (
          <Link className="rank-name entity-link" to={row.to}>
            {row.label}
          </Link>
        ) : (
          <span className="rank-name">{row.label}</span>
        );
        const bar = (
          <div className="rank-track">
            {/* Nothing at all for a zero - the 4px minimum is only so a tiny value still shows. */}
            {pct > 0 && <div className="rank-bar" style={{ width: `${pct.toFixed(2)}%` }} />}
          </div>
        );
        const title = `${row.label}${row.sub ? ` - ${row.sub}` : ""}: ${formatValue(row.value)}`;

        return layout === "stacked" ? (
          <li key={row.key} className="rank-row" title={title}>
            <div className="rank-line">
              {name}
              <span className="rank-value">{formatValue(row.value)}</span>
            </div>
            {row.sub && <span className="rank-sub">{row.sub}</span>}
            {bar}
          </li>
        ) : (
          <li key={row.key} className="rank-row" title={title}>
            <div className="rank-label">
              {name}
              {row.sub && <span className="rank-sub">{row.sub}</span>}
            </div>
            {bar}
            <span className="rank-value">{formatValue(row.value)}</span>
          </li>
        );
      })}
    </ol>
  );
}
