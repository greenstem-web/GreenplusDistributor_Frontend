import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadIndicator from "devextreme-react/load-indicator";
import * as analyticsApi from "../../api/analytics";
import { describeError } from "../../api/baseapi";
import TrendChart from "./TrendChart";
import RankBars from "./RankBars";
import LowStockCard from "./LowStockCard";
import SalesAreaMap from "./SalesAreaMap";
import Icon from "../../components/Icon";
import {
  CardHead,
  Kpi,
  RangeButtons,
  DEFAULT_RANGE,
  findRange,
  rangeDates,
  formatAmount,
  formatQuantity,
  formatDate,
  formatWhen,
} from "../../components/figures";
import "./home.css";

/**
 * The distributor's home page: how its items are selling across the companies that share their
 * sales. One date filter above everything, so every figure on the page describes the same slice.
 */
export default function HomePage() {
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTable, setShowTable] = useState(false);

  // A slow response for an old range must not land after a newer one.
  const request = useRef(0);

  const range = findRange(rangeKey);

  // `quiet` is the automatic reload after new data arrives: no dimming, no spinner, and a failure
  // leaves the figures on screen rather than replacing them with an error.
  const load = useCallback(
    ({ quiet = false } = {}) => {
      const seq = ++request.current;
      // "Today" is re-read on every load, so a page left open past midnight moves its range along.
      const { from, to } = rangeDates(range);

      if (!quiet) setLoading(true);
      analyticsApi
        .getOverview(from, to)
        .then((result) => {
          if (seq !== request.current) return;
          setData(result);
          setError(null);
        })
        .catch((e) => {
          if (seq !== request.current || quiet) return;
          setError(describeError(e, "Could not load your sales figures.").message);
        })
        .finally(() => {
          if (seq === request.current) setLoading(false);
        });
    },
    [range]
  );

  useEffect(() => {
    load();
  }, [load]);

  // What the figures on screen were built from, for the poll to compare against.
  const shownChange = useRef(null);
  shownChange.current = data?.lastChanged ?? null;

  // Re-renders the "last new data 6 min ago" text even when nothing new arrives.
  const [, setTick] = useState(0);

  /**
   * Picks up new data on its own. Every 30 seconds - and at once when the tab comes back into view -
   * it asks only WHEN the figures last changed (one small read), and reloads the whole overview only
   * if that moved. So new sales appear within about half a minute of the movement job writing them,
   * without the page re-reading everything on every tick. Paused while the tab is hidden: nobody is
   * looking, and a forgotten background tab should not keep calling the API.
   */
  useEffect(() => {
    let stopped = false;

    const check = () => {
      if (stopped || document.visibilityState !== "visible") return;
      setTick((t) => t + 1);
      analyticsApi
        .getLastChanged()
        .then((last) => {
          if (!stopped && last && last !== shownChange.current) load({ quiet: true });
        })
        .catch(() => {
          // A missed check is harmless - the next one, 30 seconds later, tries again.
        });
    };

    const timer = setInterval(check, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const periodLabel = `previous ${range.label}`;

  const itemRows = useMemo(
    () =>
      (data?.topItems || []).map((x) => ({
        key: x.distributorStockId,
        to: `/items/${x.distributorStockId}`,
        label: x.code,
        sub: x.name,
        value: x.amount,
      })),
    [data]
  );

  const companyRows = useMemo(
    () =>
      (data?.topCompanies || []).map((x) => ({
        key: x.companyId,
        to: `/companies/${x.companyId}`,
        label: x.companyName,
        sub: `${x.items} item${x.items === 1 ? "" : "s"} · qty ${formatQuantity(x.quantity)}`,
        value: x.amount,
      })),
    [data]
  );

  const hasSales = (data?.current?.companies || 0) > 0;
  const lastChanged = data ? formatWhen(data.lastChanged) : null;

  return (
    <div className="home">
      {/* One filter row above everything it scopes. */}
      <div className="home-filters">
        <RangeButtons value={rangeKey} onChange={setRangeKey} />
        <div className="home-meta">
          {loading ? <LoadIndicator height={14} width={14} /> : data && <span className="home-meta-dot" aria-hidden="true" />}
          {data && (
            <span>
              {data.sharingCompanies} of {data.linkedCompanies} compan{data.linkedCompanies === 1 ? "y shares" : "ies share"} sales
              with you
              {lastChanged ? ` · last new data ${lastChanged}` : ""}
            </span>
          )}
        </div>
      </div>

      {error && <div className="home-error">{error}</div>}

      {!data && loading && (
        <div className="home-booting">
          <LoadIndicator height={32} width={32} />
        </div>
      )}

      {data && (
        // Refetching keeps the previous render, dimmed - no skeleton flash, no layout jump.
        <div className={loading ? "home-body home-body-stale" : "home-body"}>
          <section className="kpis" aria-label="Headline figures">
            <Kpi
              label="Net sales"
              icon="dollar"
              tone="green"
              value={formatAmount(data.current.amount)}
              current={data.current.amount}
              previous={data.previous.amount}
              periodLabel={periodLabel}
            />
            <Kpi
              label="Quantity sold"
              icon="bag"
              tone="orange"
              value={formatQuantity(data.current.quantity)}
              current={data.current.quantity}
              previous={data.previous.quantity}
              periodLabel={periodLabel}
            />
            <Kpi
              label="Companies buying"
              icon="building"
              tone="blue"
              value={data.current.companies.toLocaleString("en-MY")}
              current={data.current.companies}
              previous={data.previous.companies}
              periodLabel={periodLabel}
            />
            <Kpi
              label="Items sold"
              icon="tag"
              tone="purple"
              value={data.current.items.toLocaleString("en-MY")}
              current={data.current.items}
              previous={data.previous.items}
              periodLabel={periodLabel}
            />
          </section>

          {!hasSales && (
            <div className="home-empty">
              No sales of your items in this period yet. Figures come from companies that share their sales with
              you, and are copied every 15 minutes.
            </div>
          )}

          <div className="card-row card-row-trend">
            <section className="card">
              <CardHead icon="chart" tone="green" title={`Net sales per ${data.bucket}`} sub="Sales less credit notes, before tax">
                <button type="button" className="card-toggle" onClick={() => setShowTable((v) => !v)}>
                  <Icon name={showTable ? "chart" : "calendar"} size={15} />
                  {showTable ? "Show chart" : "Show table"}
                </button>
              </CardHead>

              {showTable ? (
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
              ) : (
                <TrendChart
                  points={data.trend}
                  bucket={data.bucket}
                  formatAmount={formatAmount}
                  formatQuantity={formatQuantity}
                  formatDate={formatDate}
                />
              )}
            </section>

            {/* Keyed on lastChanged: the movement job stamps it when stock levels change too. */}
            <LowStockCard refreshKey={data.lastChanged} />
          </div>

          <section className="card">
            <CardHead icon="pin" tone="purple" title="Sales by area" sub="By the state in each company's profile" />
            <SalesAreaMap areas={data.areas || []} formatAmount={formatAmount} periodLabel={periodLabel} />
          </section>

          <div className="card-row">
            <section className="card">
              <CardHead icon="tag" tone="pink" title="Top items" sub="By net sales" />
              <RankBars
                rows={itemRows}
                tone="pink"
                layout="columns"
                formatValue={(v) => formatAmount(v)}
                emptyText="No item sales in this period."
              />
            </section>

            <section className="card">
              <CardHead icon="building" tone="blue" title="Top companies" sub="By net sales of your items" />
              <RankBars
                rows={companyRows}
                tone="blue"
                layout="stacked"
                formatValue={(v) => formatAmount(v)}
                emptyText="No company sales in this period."
              />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
