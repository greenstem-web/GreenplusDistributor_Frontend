import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStockWarnings } from "../../api/stockLevels";
import { fromApiDate } from "../../api/analytics";
import Icon from "../../components/Icon";
import { CardHead } from "../../components/figures";

/** How many rows the home page shows; the Stock page has the rest. */
const SHOWN = 8;

const qty = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });

function formatChecked(value) {
  const d = fromApiDate(value);
  if (!d) return null;
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return d.toLocaleDateString("en-MY");
}

/**
 * Companies holding your items at or below the item's warning quantity. Out of stock first, then
 * the lowest against its own warning. `refreshKey` is the home page's "figures last changed" -
 * when the movement job writes new stock levels it moves, and the panel reloads with it.
 */
export default function LowStockCard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStockWarnings()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const items = data?.items || [];
  const total = (data?.lowCount || 0) + (data?.outCount || 0);
  const checked = data ? formatChecked(data.lastChecked) : null;

  return (
    <section className="card lowstock-card">
      <CardHead
        icon="box"
        tone="amber"
        title="Low stock at companies"
        sub={`At or below the item's warning quantity${checked ? ` · stock read ${checked}` : ""}`}
      />

      {error && <div className="lowstock-empty">Could not load stock levels.</div>}

      {!error && data && data.itemsWithWarning === 0 && (
        <div className="lowstock-empty">
          No item has a warning quantity yet. Set one on the <Link to="/items">Items</Link> page and
          companies running low on it will show here.
        </div>
      )}

      {!error && data && data.itemsWithWarning > 0 && total === 0 && (
        <div className="lowstock-ok">
          <Icon name="checkCircle" size={17} />
          <span>Every company is above the warning quantity for all your items.</span>
        </div>
      )}

      {!error && total > 0 && (
        <>
          <div className="lowstock-summary">
            {data.outCount > 0 && (
              <span className="lowstock-pill lowstock-pill-out">{data.outCount} out of stock</span>
            )}
            {data.lowCount > 0 && <span className="lowstock-pill lowstock-pill-low">{data.lowCount} low</span>}
            <span className="lowstock-at">
              at {data.companiesAffected} {data.companiesAffected === 1 ? "company" : "companies"}
            </span>
          </div>

          <table className="lowstock-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Item</th>
                <th className="num">Quantity</th>
                <th className="num">Warning at</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, SHOWN).map((row) => (
                <tr key={`${row.companyId}-${row.distributorStockId}`}>
                  <td>
                    <Link className="entity-link" to={`/companies/${row.companyId}`}>
                      {row.companyName}
                    </Link>
                  </td>
                  <td>
                    <Link className="lowstock-code entity-link" to={`/items/${row.distributorStockId}`}>
                      {row.code}
                    </Link>
                    {row.name ? <span className="lowstock-name"> {row.name}</span> : null}
                  </td>
                  <td className={"num" + (row.quantity <= 0 ? " lowstock-neg" : "")}>
                    {qty.format(row.quantity)}
                    {row.uom ? <span className="lowstock-uom"> {row.uom}</span> : null}
                  </td>
                  <td className="num">{qty.format(row.warningQuantity)}</td>
                  <td>
                    <span className={row.status === "out" ? "lowstock-pill lowstock-pill-out" : "lowstock-pill lowstock-pill-low"}>
                      {row.status === "out" ? "Out" : "Low"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > SHOWN && (
            <div className="lowstock-more">
              <Link to="/companies?status=warning">{total - SHOWN} more on Stock &amp; Visibility</Link>
            </div>
          )}
        </>
      )}

      {/* At the foot of the card, which stretches to the chart beside it. */}
      <div className="lowstock-foot">
        <Link to="/companies" className="card-toggle">
          View all stock
        </Link>
      </div>
    </section>
  );
}
