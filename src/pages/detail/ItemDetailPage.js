import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import DataGrid, { Column, HeaderFilter, Pager, Paging, SearchPanel } from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import { getItemDetail } from "../../api/analytics";
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

const money = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * One catalog item: how it is selling, and every linked company - can it see the item, how many
 * does it hold, what did it sell. Opened from the dashboard's top items, the low-stock card, Items
 * and Stock & Visibility. Read-only: the item is edited on Items, visibility on Stock & Visibility.
 */
export default function ItemDetailPage() {
  const { itemId } = useParams();
  const { setHeading } = useOutletContext() || {};
  const { range, rangeKey, setRangeKey, data, loading, error, notFound, reload } = useDetail(getItemDetail, itemId);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!data || !setHeading) return;
    setHeading(data.item.code, data.item.name || "");
  }, [data, setHeading]);

  const companies = useMemo(() => data?.companies || [], [data]);

  const stock = useMemo(() => {
    const held = companies.filter((c) => c.quantity !== null && c.quantity !== undefined);
    const onHand = held.filter((c) => c.quantity > 0);
    return {
      // Only stock that is there: a company below zero (sold before receiving) does not take
      // units away from the others - it is counted separately instead.
      total: onHand.reduce((sum, c) => sum + Number(c.quantity), 0),
      holding: onHand.length,
      negative: held.filter((c) => c.quantity < 0).length,
      low: companies.filter((c) => c.status === "low").length,
      out: companies.filter((c) => c.status === "out").length,
      shown: companies.filter((c) => c.visible === true).length,
    };
  }, [companies]);

  const renderCompany = useCallback(
    (cell) => (
      <span>
        <Link className="entity-link" to={`/companies/${cell.data.companyId}`}>
          {cell.data.companyName}
        </Link>
        {cell.data.companyStockCode && data && cell.data.companyStockCode !== data.item.code ? (
          <span className="ci-muted" title="The code this company knows the item by">
            {" "}
            as {cell.data.companyStockCode}
          </span>
        ) : null}
      </span>
    ),
    [data]
  );

  if (notFound) {
    return (
      <div className="home detail">
        <div className="home-error">{error}</div>
        <Link to="/items">Back to Items</Link>
      </div>
    );
  }

  const periodLabel = `previous ${range.label}`;
  const checked = data ? formatWhen(data.lastChecked) : null;
  const item = data?.item;

  return (
    <div className="home detail">
      {item && (
        <section className="card detail-facts" aria-label="Item">
          <Fact label="Description" value={item.description || item.name} wide />
          <Fact label="UOM" value={item.uom} />
          <Fact label="Barcode" value={item.barcode} />
          <Fact label="Cost" value={`RM ${money.format(item.cost || 0)}`} />
          <Fact label="Price" value={`RM ${money.format(item.price || 0)}`} />
          <Fact label="Warning at" value={item.warningQuantity != null ? formatQuantity(item.warningQuantity) : "Not set"} />
          <Fact label="By default" value={item.defaultVisible ? "Shown to companies" : "Hidden from companies"} />
          <Fact
            label="Status"
            value={item.active ? "Published" : "Inactive - not published"}
            tone={item.active ? "on" : "off"}
          />
        </section>
      )}

      <div className="home-filters">
        <RangeButtons value={rangeKey} onChange={setRangeKey} />
        <div className="home-meta">
          {loading && <LoadIndicator height={16} width={16} />}
          {checked && <span>Stock read {checked}</span>}
          <Link className="detail-action" to="/items">
            Edit on Items
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
              label="Stock at companies"
              icon="tag"
              tone="purple"
              value={`${formatQuantity(stock.total)}${item.uom ? ` ${item.uom}` : ""}`}
              note={[
                `On hand at ${stock.holding} compan${stock.holding === 1 ? "y" : "ies"}`,
                stock.negative > 0 ? `${stock.negative} below zero` : null,
                stock.low + stock.out > 0 ? `${stock.out} out, ${stock.low} low` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </section>

          <section className="card">
            <CardHead
              icon="chart"
              tone="green"
              title={`Net sales per ${data.bucket}`}
              sub="Sales less credit notes, before tax - companies that share their sales"
            >
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

          <section className="card">
            <CardHead
              icon="building"
              tone="blue"
              title="Companies"
              sub={`Shown to ${stock.shown} of ${companies.length} · sales for the last ${range.label}`}
            />

            <DataGrid
              className="detail-grid"
              dataSource={companies}
              keyExpr="companyId"
              showBorders={false}
              showColumnLines={false}
              showRowLines={true}
              hoverStateEnabled={true}
              columnAutoWidth={false}
              columnHidingEnabled={true}
              noDataText="No companies are linked to your account yet."
            >
              <SearchPanel visible={true} width={240} placeholder="Search company" />
              <HeaderFilter visible={true} />
              <Paging defaultPageSize={20} />
              <Pager visible="auto" showInfo={true} />

              {/* Narrow screens fold the least-needed columns into the row detail first (0 goes first).
                  Company, In stock and Net sales never fold. */}
              <Column dataField="companyName" caption="Company" minWidth={180} cellRender={renderCompany} />
              <Column
                dataField="visible"
                caption="Visible"
                width={110}
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
                cellRender={(cell) => <QuantityCell row={{ ...cell.data, uom: item.uom }} consenting={cell.data.isConsenting} />}
              />
              <Column
                dataField="status"
                caption="Stock"
                width={75}
                allowSearch={false}
                hidingPriority={3}
                cellRender={(cell) => <StatusBadge status={cell.value} />}
              />
              <Column
                dataField="amount"
                caption="Net sales"
                dataType="number"
                alignment="right"
                width={120}
                allowSearch={false}
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
                cellRender={(cell) => (cell.value ? formatQuantity(cell.value) : <span className="ci-muted">-</span>)}
              />
              <Column
                dataField="lastSoldDate"
                caption="Last sale"
                dataType="date"
                width={105}
                allowSearch={false}
                hidingPriority={0}
                cellRender={(cell) => <LastSold value={cell.data.lastSoldDate} />}
              />
            </DataGrid>
          </section>
        </div>
      )}
    </div>
  );
}

/** One labelled fact in the item card. */
function Fact({ label, value, wide, tone }) {
  return (
    <div className={"detail-fact" + (wide ? " detail-fact-wide" : "")}>
      <div className="detail-fact-label">{label}</div>
      <div className={"detail-fact-value" + (tone ? ` detail-fact-${tone}` : "")}>{value || "-"}</div>
    </div>
  );
}
