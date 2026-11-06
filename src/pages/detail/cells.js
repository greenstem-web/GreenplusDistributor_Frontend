import React from "react";
import { formatAmount, formatDate, formatQuantity } from "../../components/figures";

/**
 * Cells the two drill-down pages share, styled with Stock & Visibility's classes so a quantity or a
 * status badge looks the same wherever it appears.
 */

const STATUS_LABEL = { out: "Out", low: "Low", ok: "OK" };

/** "Out" / "Low" / "OK", or nothing when the item has no warning quantity (or no stock copied). */
export function StatusBadge({ status }) {
  return status ? <span className={`stock-badge stock-badge-${status}`}>{STATUS_LABEL[status]}</span> : null;
}

/**
 * The copied quantity, red at or below zero. No quantity means one of two different things, and
 * the cell says which: the company does not share its data, or it shares but does not hold the item.
 */
export function QuantityCell({ row, consenting }) {
  if (row.quantity === null || row.quantity === undefined) {
    return (
      <span className="ci-muted" title={consenting ? "Not in this company's stock" : "This company does not share its data"}>
        {consenting ? "-" : "Not shared"}
      </span>
    );
  }
  return (
    <span className={row.quantity <= 0 ? "ci-qty ci-qty-neg" : "ci-qty"}>
      {formatQuantity(row.quantity)}
      {row.uom ? <span className="ci-muted"> {row.uom}</span> : null}
    </span>
  );
}

/**
 * Shown / Hidden, with "custom" when this company has its own setting. Read-only: it is changed on
 * Stock & Visibility. Null visibility is an item that is not published (withdrawn or inactive).
 */
export function VisibilityState({ row }) {
  if (row.visible === null || row.visible === undefined) {
    return <span className="ci-muted">{row.inCatalog === false ? "Withdrawn" : "Not published"}</span>;
  }
  return (
    <span className={row.visible ? "vis-state vis-state-on" : "vis-state"}>
      {row.visible ? "Shown" : "Hidden"}
      {row.isOverride && (
        <span className="ci-muted" title="Set for this company only, not the catalog default">
          {" "}
          · custom
        </span>
      )}
    </span>
  );
}

export function LastSold({ value }) {
  return value ? <span>{formatDate(value, "day", false)}</span> : <span className="ci-muted">-</span>;
}

/** The trend as rows - every value without hovering. */
export function TrendTable({ data }) {
  return (
    <div className="trend-table-wrap">
      <table className="trend-table">
        <thead>
          <tr>
            <th scope="col">{data.bucket === "month" ? "Month" : "Date"}</th>
            <th scope="col" className="num">Net sales</th>
            <th scope="col" className="num">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {data.trend.map((p) => (
            <tr key={p.date}>
              <td>{formatDate(p.date, data.bucket, false)}</td>
              <td className="num">{formatAmount(p.amount)}</td>
              <td className="num">{formatQuantity(p.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
