import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import DataGrid, { Column, HeaderFilter, Pager, Paging, SearchPanel } from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import { getCompanyDetail } from "../../api/analytics";
import TrendChart from "../home/TrendChart";
import Icon from "../../components/Icon";
import {
  CardHead,
  Kpi,
  RangeButtons,
  formatAmount,
  formatQuantity,
  formatDate,
  formatWhen,
} from "../../components/figures";
import useDetail from "./useDetail";
import { QuantityCell, StatusBadge, VisibilityState, LastSold, TrendTable } from "./cells";
import "../home/home.css";
import "../company-items/companyItems.css";
import "./detail.css";

/**
 * One company: how it is selling your items, and every catalog item there - visible or not, how
 * many it holds, what it sold. Opened from the dashboard's top companies, the low-stock card and
 * Stock & Visibility.
 *
 * Read-only on purpose: visibility is changed on Stock & Visibility (linked from here, already
 * narrowed to this company), so there is one place that does it.
 */
export default function CompanyDetailPage() {
  const { companyId } = useParams();
  const { setHeading } = useOutletContext() || {};
  const { range, rangeKey, setRangeKey, data, loading, error, notFound, reload } = useDetail(getCompanyDetail, companyId);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!data || !setHeading) return;
    const facts = [data.companyCode, data.isConsenting ? "Shares sales and stock with you" : "Does not share its sales or stock"];
    setHeading(data.companyName, facts.filter(Boolean).join(" · "));
  }, [data, setHeading]);

  const items = useMemo(() => data?.items || [], [data]);

  const stock = useMemo(() => {
    const held = items.filter((i) => i.quantity !== null && i.quantity !== undefined);
    return {
      held: held.length,
      low: items.filter((i) => i.status === "low").length,
      out: items.filter((i) => i.status === "out").length,
      shown: items.filter((i) => i.visible === true).length,
      catalog: items.filter((i) => i.inCatalog).length,
    };
  }, [items]);

  const renderCode = useCallback(
    (cell) => (
      <span>
        <Link className="ci-code entity-link" to={`/items/${cell.data.distributorStockId}`}>
          {cell.data.code}
        </Link>
        {cell.data.companyStockCode && cell.data.companyStockCode !== cell.data.code ? (
          <span className="ci-muted" title="The code this company knows the item by">
            {" "}
            as {cell.data.companyStockCode}
          </span>
        ) : null}
      </span>
    ),
    []
  );

  if (notFound) {
    return (
      <div className="home detail">
        <div className="home-error">{error}</div>
        <Link to="/companies">Back to Stock &amp; Visibility</Link>
      </div>
    );
  }

  const periodLabel = `previous ${range.label}`;
  const checked = data ? formatWhen(data.lastChecked) : null;

  return (
    <div className="home detail">
      <div className="home-filters">
        <RangeButtons value={rangeKey} onChange={setRangeKey} />
        <div className="home-meta">
          {loading && <LoadIndicator height={16} width={16} />}
          {checked && <span>Stock read {checked}</span>}
          <Link className="detail-action" to={`/companies?company=${companyId}`}>
            Change visibility
          </Link>
          <Button icon="refresh" hint="Reload" stylingMode="text" onClick={reload} />
        </div>
      </div>

      {error && <div className="home-error">{error}</div>}

      {!data && loading && (
        <div className="home-booting">
          <LoadIndicator height={32} width={32} />
        </div>
      )}

      {data && (
        <div className={loading ? "home-body home-body-stale" : "home-body"}>
          {!data.isConsenting && (
            <div className="ci-warning">
              {data.companyName} has not consented to sharing its data, so its sales and stock are not
              copied. Which of your items it can see is still yours to set.
            </div>
          )}

          {data.isConsenting && (
            <>
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
                  label="Items sold"
                  icon="tag"
                  tone="purple"
                  value={data.current.items.toLocaleString("en-MY")}
                  current={data.current.items}
                  previous={data.previous.items}
                  periodLabel={periodLabel}
                />
                <Kpi
                  label="Stock alerts"
                  icon="alert"
                  tone="blue"
                  value={stock.low + stock.out === 0 ? "None" : `${stock.out} out · ${stock.low} low`}
                  note={`${stock.held} of your items in stock here`}
                />
              </section>

              <section className="card">
                <CardHead icon="chart" tone="green" title={`Net sales per ${data.bucket}`} sub="Sales less credit notes, before tax">
                  <button type="button" className="card-toggle" onClick={() => setShowTable((v) => !v)}>
                    <Icon name={showTable ? "chart" : "calendar"} size={15} />
                    {showTable ? "Show chart" : "Show table"}
                  </button>
                </CardHead>
                {showTable ? (
                  <TrendTable data={data} />
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
            </>
          )}

          <section className="card">
            <CardHead
              icon="tag"
              tone="pink"
              title="Your items here"
              sub={`${stock.shown} of ${stock.catalog} shown to this company${data.isConsenting ? ` · sales for the last ${range.label}` : ""}`}
            />

            <DataGrid
              className="detail-grid"
              dataSource={items}
              keyExpr="distributorStockId"
              showBorders={false}
              showColumnLines={false}
              showRowLines={true}
              hoverStateEnabled={true}
              columnAutoWidth={false}
              columnHidingEnabled={true}
              noDataText="None of your items is published to this company."
            >
              <SearchPanel visible={true} width={240} placeholder="Search code or name" />
              <HeaderFilter visible={true} />
              <Paging defaultPageSize={20} />
              <Pager visible="auto" showInfo={true} />

              <Column dataField="code" caption="Code" width={170} cellRender={renderCode} />
              {/* Narrow screens fold the least-needed columns into the row detail first (0 goes first).
                  Code, In stock and Net sales never fold - they are what the page is for. */}
              <Column dataField="name" caption="Description" minWidth={160} hidingPriority={3} />
              <Column
                dataField="visible"
                caption="Visible"
                width={95}
                allowSearch={false}
                hidingPriority={2}
                cellRender={(cell) => <VisibilityState row={cell.data} />}
              />
              <Column
                dataField="quantity"
                caption="In stock"
                dataType="number"
                alignment="right"
                width={110}
                allowSearch={false}
                cellRender={(cell) => <QuantityCell row={cell.data} consenting={data.isConsenting} />}
              />
              <Column
                dataField="status"
                caption="Stock"
                width={75}
                allowSearch={false}
                hidingPriority={4}
                cellRender={(cell) => <StatusBadge status={cell.value} />}
              />
              <Column
                dataField="amount"
                caption="Net sales"
                dataType="number"
                alignment="right"
                width={120}
                allowSearch={false}
                visible={data.isConsenting}
                cellRender={(cell) => (cell.value ? formatAmount(cell.value) : <span className="ci-muted">-</span>)}
              />
              <Column
                dataField="quantitySold"
                caption="Qty sold"
                dataType="number"
                alignment="right"
                width={90}
                allowSearch={false}
                hidingPriority={1}
                visible={data.isConsenting}
                cellRender={(cell) => (cell.value ? formatQuantity(cell.value) : <span className="ci-muted">-</span>)}
              />
              <Column
                dataField="lastSoldDate"
                caption="Last sale"
                dataType="date"
                width={105}
                allowSearch={false}
                hidingPriority={0}
                visible={data.isConsenting}
                cellRender={(cell) => <LastSold value={cell.data.lastSoldDate} />}
              />
            </DataGrid>
          </section>
        </div>
      )}
    </div>
  );
}

