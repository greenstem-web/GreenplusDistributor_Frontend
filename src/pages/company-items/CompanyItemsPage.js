import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DataGrid, { Column, Grouping, Paging, Scrolling, SearchPanel } from "devextreme-react/data-grid";
import SelectBox from "devextreme-react/select-box";
import LoadPanel from "devextreme-react/load-panel";
import notify from "devextreme/ui/notify";
import * as catalogApi from "../../api/catalog";
import { getCompanyItems } from "../../api/companyItems";
import { fromApiDate } from "../../api/analytics";
import { describeError } from "../../api/baseapi";
import Icon from "../../components/Icon";
import "./companyItems.css";

/** What the server did to visibility, phrased for a person. Keyed on `action`, never guessed from the switch. */
const ACTION_MESSAGE = {
  created: (visible) => (visible ? "Shown for this company." : "Hidden for this company."),
  updated: (visible) => (visible ? "Shown for this company." : "Hidden for this company."),
  removed: () => "Back to the catalog default.",
  unchanged: () => "No change.",
};

/** The quick filters. "warning" (low or out) is what the home page's low-stock panel links to. */
const VIEWS = [
  { key: "all", label: "All", test: () => true },
  { key: "shown", label: "Shown", test: (r) => r.visible },
  { key: "hidden", label: "Hidden", test: (r) => !r.visible },
  { key: "custom", label: "Custom", test: (r) => r.isOverride },
  { key: "warning", label: "Low & Out", test: (r) => r.status === "low" || r.status === "out" },
  { key: "out", label: "Out of Stock", test: (r) => r.status === "out" },
];

const STATUS_LABEL = { out: "Out", low: "Low", ok: "OK" };

const qty = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });

const rowKey = (companyId, distributorStockId) => `${companyId}-${distributorStockId}`;

function formatChecked(value) {
  const d = fromApiDate(value);
  if (!d) return "";
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return d.toLocaleDateString("en-MY");
}

/**
 * The Visible toggle: a plain button styled as a switch. It only shows the value it is given, so it
 * moves the moment the row's value changes - which the page does on the click, before the save.
 */
function VisibilityToggle({ on, onToggle, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={"vis-toggle" + (on ? " vis-toggle-on" : "")}
      onClick={onToggle}
    >
      <span className="vis-toggle-knob" />
    </button>
  );
}

/**
 * Stock & Visibility: every catalog item at every linked company - what the company can see and,
 * where it shares its data, how many it holds against the item's warning quantity. All companies
 * first; pick one to narrow it. Replaces the separate Visibility and Stock pages.
 */
export default function CompanyItemsPage() {
  const [searchParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  // ?company= narrows to one company on arrival - the company page's "Change visibility" link.
  const [companyId, setCompanyId] = useState(() => {
    const fromUrl = Number(searchParams.get("company"));
    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() =>
    VIEWS.some((v) => v.key === searchParams.get("status")) ? searchParams.get("status") : "all"
  );
  const [search, setSearch] = useState("");
  // How many rows the search leaves, for the footer.
  const [visibleCount, setVisibleCount] = useState(0);
  // Rows with a visibility save in flight - a ref, so a second click is refused at once and nothing
  // re-renders just because a save started.
  const pendingRef = useRef(new Set());

  const fail = useCallback((error, fallback) => {
    notify({ message: describeError(error, fallback).message, type: "error", displayTime: 6000 }, "error", 6000);
  }, []);

  useEffect(() => {
    catalogApi
      .getCompanies()
      .then((list) => setCompanies(list || []))
      .catch(() => setCompanies([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getCompanyItems(companyId)
      .then((list) => setRows(list.map((r) => ({ ...r, key: rowKey(r.companyId, r.distributorStockId) }))))
      .catch((error) => {
        setRows([]);
        fail(error, "Could not load your companies' items.");
      })
      .finally(() => setLoading(false));
  }, [companyId, fail]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * OPTIMISTIC: the row takes the new value on the click, so the toggle moves at once, and the save
   * runs behind it. A refused save puts the row back as it was.
   */
  const setVisible = useCallback(
    async (row, visible) => {
      const key = row.key;
      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);

      const patch = (changes) =>
        setRows((current) => current.map((r) => (r.key === key ? { ...r, ...changes } : r)));

      const before = { visible: row.visible, isOverride: row.isOverride };
      patch({ visible });

      try {
        const result = await catalogApi.setVisibility(row.companyId, row.distributorStockId, visible);
        // isOverride from the RESPONSE: going back to the default deletes the override.
        patch({ visible: result.visible, isOverride: result.isOverride });
        const message = (ACTION_MESSAGE[result.action] || ACTION_MESSAGE.unchanged)(result.visible);
        notify({ message: `${row.code} at ${row.companyName}: ${message}`, type: "success", displayTime: 2000 }, "success", 2000);
      } catch (error) {
        patch(before);
        fail(error, "Could not change visibility.");
      } finally {
        pendingRef.current.delete(key);
      }
    },
    [fail]
  );

  // Cell renderers read setVisible through a ref so THEY never change - a new render function makes
  // the grid redraw every cell in the column, not just the changed row.
  const setVisibleRef = useRef(setVisible);
  setVisibleRef.current = setVisible;

  const renderVisible = useCallback((cell) => {
    const r = cell.data;
    return (
      <div className="vis-cell" title={r.visible ? "Shown to this company" : "Hidden from this company"}>
        <VisibilityToggle
          on={r.visible}
          label={`${r.code} visible at ${r.companyName}`}
          onToggle={() => setVisibleRef.current(r, !r.visible)}
        />
      </div>
    );
  }, []);

  const renderSource = useCallback((cell) => {
    const r = cell.data;
    const defaultText = r.defaultVisible ? "shown" : "hidden";
    if (!r.isOverride) {
      return (
        <span className="src-badge" title={`Follows the catalog default (${defaultText})`}>
          Default
        </span>
      );
    }
    return (
      <span className="src-custom">
        <span className="src-badge src-badge-custom" title="Set for this company only">
          Custom
        </span>
        <button
          type="button"
          className="src-reset"
          title={`Back to the catalog default (${defaultText})`}
          onClick={() => setVisibleRef.current(r, r.defaultVisible)}
        >
          Reset
        </button>
      </span>
    );
  }, []);

  const renderGroup = useCallback((cell) => {
    const first = cell.data?.items?.[0] ?? cell.data?.collapsedItems?.[0];
    return (
      <div className="ci-group">
        {first ? (
          <Link className="ci-group-name entity-link" to={`/companies/${first.companyId}`} onClick={(e) => e.stopPropagation()}>
            {cell.value}
          </Link>
        ) : (
          <span className="ci-group-name">{cell.value}</span>
        )}
        <Icon className={"ci-group-chevron" + (cell.row.isExpanded ? "" : " is-collapsed")} name="chevronDown" size={18} />
      </div>
    );
  }, []);

  const renderCode = useCallback((cell) => {
    const r = cell.data;
    return (
      <span>
        <Link className="ci-code entity-link" to={`/items/${r.distributorStockId}`}>
          {r.code}
        </Link>
        {r.companyStockCode && r.companyStockCode !== r.code ? (
          <span className="ci-muted" title="The code this company knows the item by">
            {" "}
            as {r.companyStockCode}
          </span>
        ) : null}
      </span>
    );
  }, []);

  const renderQuantity = useCallback((cell) => {
    const r = cell.data;
    if (r.quantity === null || r.quantity === undefined) {
      return (
        <span className="ci-muted" title={r.isConsenting ? "Not in this company's stock yet" : "This company does not share its data"}>
          {r.isConsenting ? "-" : "Not shared"}
        </span>
      );
    }
    return (
      <span className="ci-qty">
        <span className={`ci-qty-num ci-qty-${r.quantity <= 0 ? "out" : r.status || "none"}`}>{qty.format(r.quantity)}</span>
        {r.uom ? <span className="ci-uom"> {r.uom}</span> : null}
      </span>
    );
  }, []);

  const onContentReady = useCallback((e) => setVisibleCount(e.component.totalCount()), []);

  const renderStatus = useCallback((cell) => {
    const s = cell.data.status;
    return s ? <span className={`stock-badge stock-badge-${s}`}>{STATUS_LABEL[s]}</span> : null;
  }, []);

  const counts = useMemo(() => {
    const c = {};
    for (const v of VIEWS) c[v.key] = rows.filter(v.test).length;
    return c;
  }, [rows]);

  const lastRead = useMemo(() => {
    const latest = rows.reduce((max, r) => (r.checkedDate && r.checkedDate > max ? r.checkedDate : max), "");
    return latest ? formatChecked(latest) : null;
  }, [rows]);

  const shown = useMemo(() => {
    const test = (VIEWS.find((v) => v.key === view) || VIEWS[0]).test;
    return rows.filter(test);
  }, [rows, view]);

  const companyChoices = useMemo(() => [{ companyId: null, companyName: "All companies" }, ...companies], [companies]);
  const selectedCompany = companies.find((c) => c.companyId === companyId);

  const allCompanies = companyId === null;
  const companiesListed = useMemo(() => new Set(shown.map((r) => r.companyId)).size, [shown]);

  return (
    <div className="ci-page">
      <div className="ci-head">
        <div className="ci-field">
          <label className="ci-label" htmlFor="ci-company">
            Company
          </label>
          <SelectBox
            inputAttr={{ id: "ci-company" }}
            dataSource={companyChoices}
            valueExpr="companyId"
            displayExpr="companyName"
            value={companyId}
            // "All companies" is the null choice, which a SelectBox shows as its placeholder.
            placeholder="All companies"
            searchEnabled={companies.length > 8}
            onSelectionChanged={(e) => {
              // Lookups report a user pick through onSelectionChanged, not onValueChanged.
              if (e.selectedItem) setCompanyId(e.selectedItem.companyId);
            }}
          />
        </div>

        <div className="gp-stats">
          <div className="gp-stat gp-stat-green">
            <span className="gp-stat-value">{counts.shown}</span>
            <span className="gp-stat-label">Shown</span>
          </div>
          <div className="gp-stat gp-stat-grey">
            <span className="gp-stat-value">{counts.hidden}</span>
            <span className="gp-stat-label">Hidden</span>
          </div>
          <div className="gp-stat gp-stat-yellow">
            <span className="gp-stat-value">{counts.warning - counts.out}</span>
            <span className="gp-stat-label">Low Stock</span>
          </div>
          <div className="gp-stat gp-stat-red">
            <span className="gp-stat-value">{counts.out}</span>
            <span className="gp-stat-label">Out of Stock</span>
          </div>
          <div className="gp-stat gp-stat-blue ci-stat-date">
            <span className="gp-stat-value gp-stat-small">{lastRead || "-"}</span>
            <span className="gp-stat-label">Stock Read</span>
          </div>
        </div>
      </div>

      {selectedCompany && !selectedCompany.isConsenting && (
        <div className="ci-warning">
          This company has not consented to sharing its data. Visibility still applies; its stock
          quantities and sales stay hidden until consent is given.
        </div>
      )}

      <div className="ci-card">
        <div className="ci-toolbar">
          <div className="ci-views" role="tablist" aria-label="Show">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                className={"ci-view" + (view === v.key ? " ci-view-on" : "")}
                onClick={() => setView(v.key)}
              >
                {v.label}
                <span className="ci-view-count">{counts[v.key]}</span>
              </button>
            ))}
          </div>
          <div className="ci-tools">
            <label className="gp-search ci-search">
              <Icon name="search" size={17} />
              <input
                type="search"
                placeholder={allCompanies ? "Search company, code or name" : "Search code or name"}
                aria-label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button type="button" className="gp-icon-btn" title="Reload" aria-label="Reload" onClick={load}>
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </div>

        <div className="ci-grid-wrap">
          <DataGrid
            className="ci-grid ci-grid-roomy"
            dataSource={shown}
            keyExpr="key"
            showBorders={false}
            showColumnLines={false}
            showRowLines={false}
            hoverStateEnabled={true}
            columnAutoWidth={false}
            // On a narrow screen the read time and warning level fold into the row detail first.
            columnHidingEnabled={true}
            // Only the row whose value changed is redrawn, not the whole list.
            repaintChangesOnly={true}
            noDataText={loading ? "" : rows.length === 0 ? "No companies are linked to your account yet." : "Nothing here."}
            onContentReady={onContentReady}
            height="100%"
          >
            <SearchPanel visible={false} text={search} />
            {/* All companies: one green band per company, folded by clicking it. */}
            <Grouping autoExpandAll={true} expandMode="rowClick" contextMenuEnabled={false} />
            <Scrolling mode="virtual" />
            <Paging enabled={false} />

            <Column
              dataField="companyName"
              caption="Company"
              groupIndex={allCompanies ? 0 : undefined}
              visible={false}
              groupCellRender={renderGroup}
            />
            <Column dataField="code" caption="Code" width={160} cellRender={renderCode} />
            <Column dataField="name" caption="Description" minWidth={200} />
            <Column
              dataField="visible"
              caption="Visible"
              width={130}
              allowSearch={false}
              cellRender={renderVisible}
            />
            <Column caption="Source" width={150} allowSorting={false} allowFiltering={false} cellRender={renderSource} />
            <Column
              dataField="quantity"
              caption="Quantity"
              dataType="number"
              alignment="left"
              width={160}
              allowSearch={false}
              cellRender={renderQuantity}
            />
            <Column
              dataField="warningQuantity"
              caption="Warning at"
              dataType="number"
              alignment="left"
              width={130}
              hidingPriority={1}
              allowSearch={false}
              cellRender={renderWarning}
            />
            <Column dataField="status" caption="Stock" width={150} allowSearch={false} cellRender={renderStatus} />
            <Column
              dataField="checkedDate"
              caption="Read"
              width={120}
              hidingPriority={0}
              allowSearch={false}
              cellRender={renderRead}
            />
          </DataGrid>
        </div>

        <div className="ci-foot">
          <span>
            Showing {visibleCount.toLocaleString("en-MY")} of {rows.length.toLocaleString("en-MY")} item{rows.length === 1 ? "" : "s"}
            {allCompanies ? ` across ${companiesListed} compan${companiesListed === 1 ? "y" : "ies"}` : ""}
          </span>
          <span>Quantities come from companies that share their data with you</span>
        </div>
      </div>

      <LoadPanel visible={loading} showPane={true} position={{ of: ".ci-page" }} />
    </div>
  );
}

const quantityFormat = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });

/** The warning quantity on an amber pill; a dash when the item has none. */
function renderWarning(cell) {
  if (cell.value == null) return <span className="ci-none" title="No low-stock warning">-</span>;
  return <span className="ci-warn">{quantityFormat.format(cell.value)}</span>;
}

function renderRead(cell) {
  return <span className="ci-read">{formatChecked(cell.data.checkedDate)}</span>;
}
