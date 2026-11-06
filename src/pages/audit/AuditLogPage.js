import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DataGrid, { Column, MasterDetail, Pager, Paging } from "devextreme-react/data-grid";
import SelectBox from "devextreme-react/select-box";
import notify from "devextreme/ui/notify";
import CustomStore from "devextreme/data/custom_store";
import { getAuditLog, getAuditUsers } from "../../api/audit";
import { fromApiDate } from "../../api/analytics";
import { describeError } from "../../api/baseapi";
import Icon from "../../components/Icon";
import { RangeButtons, DEFAULT_RANGE, findRange, rangeDates } from "../../components/figures";
import "../home/home.css";
import "../company-items/companyItems.css";
import "./audit.css";

/** The category tabs. "session" is sign-ins and sign-outs. */
const CATEGORIES = [
  { key: "", label: "All" },
  { key: "catalog", label: "Items" },
  { key: "visibility", label: "Visibility" },
  { key: "users", label: "Users" },
  { key: "session", label: "Sign-in" },
];

/** What each action reads as. Unknown actions show as they are stored. */
const ACTION_LABEL = {
  "item.create": "Item added",
  "item.update": "Item edited",
  "item.withdraw": "Item withdrawn",
  "catalog.import": "Excel import",
  "visibility.set": "Visibility set",
  "visibility.reset": "Back to default",
  login: "Signed in",
  "login.failed": "Sign-in failed",
  "login.locked": "Account locked",
  logout: "Signed out",
  "password.change": "Password changed",
  "password.change.failed": "Wrong password",
  "user.create": "User added",
  "user.update": "User edited",
  "user.password.reset": "Password reset",
  "user.link.sent": "Password link",
  "password.forgot": "Forgot password",
  "password.set": "Password set",
  "user.unlock": "User unlocked",
};

/** Badge tone per action - the ones worth a second look (failed, locked, withdrawn) stand out. */
const ACTION_TONE = {
  "item.withdraw": "warn",
  "login.failed": "warn",
  "login.locked": "bad",
  "password.change.failed": "warn",
};

const SEARCH_DELAY_MS = 400;

function formatWhen(value) {
  const d = fromApiDate(value);
  if (!d) return "";
  const date = d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

/** Rows per page to choose from; the API allows up to 200. */
const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

// Constants, not inline: a new object or function on each render reads to DevExtreme as a changed
// option and makes the grid load its page again - and every load re-renders this page (the count),
// so it would never stop.
const REMOTE_OPERATIONS = { paging: true };
const renderWhen = (cell) => formatWhen(cell.data.createdDate);
const actionDisplayValue = (row) => ACTION_LABEL[row.action] || row.action;

/**
 * Audit log: who changed what in the catalog, visibility and users, and who signed in - newest first.
 * Read-only. Rows are written by the API in the same save as the change they describe, so the log
 * never shows a change that did not happen.
 *
 * Paged on the server: the grid asks the API for one page at a time, with the period, category, user
 * and search applied there, so a long log is never loaded whole.
 */
export default function AuditLogPage() {
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const grid = useRef(null);

  useEffect(() => {
    getAuditUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  // The search goes to the server, so it waits for a pause in typing rather than firing per key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Back to the first page whenever a filter changes - worked out in the same render as the new data
  // source, so the grid asks for one page, not the old page number and then the first.
  const filterKey = `${rangeKey}|${userId ?? ""}|${category}|${search}`;
  const [paging, setPaging] = useState({ key: filterKey, index: 0 });
  const pageIndex = paging.key === filterKey ? paging.index : 0;
  const onPageIndexChange = useCallback((index) => setPaging({ key: filterKey, index }), [filterKey]);

  const dataSource = useMemo(() => {
    const { from, to } = rangeDates(findRange(rangeKey));
    return new CustomStore({
      key: "id",
      load: (options) => {
        setLoading(true);
        return getAuditLog({
          from,
          to,
          userId,
          category,
          search,
          skip: options.skip || 0,
          take: options.take || DEFAULT_PAGE_SIZE,
        })
          .then((result) => {
            setTotal(result.total ?? 0);
            return { data: result.items || [], totalCount: result.total ?? 0 };
          })
          .catch((error) => {
            setTotal(0);
            notify({ message: describeError(error, "Could not load the audit log.").message, type: "error", displayTime: 6000 }, "error", 6000);
            return { data: [], totalCount: 0 };
          })
          .finally(() => setLoading(false));
      },
    });
  }, [rangeKey, userId, category, search]);

  const reload = useCallback(() => grid.current?.instance()?.refresh(), []);

  const userChoices = useMemo(
    () => [{ userId: null, label: "All users" }, ...users.map((u) => ({ userId: u.userId, label: u.active ? u.username : `${u.username} (inactive)` }))],
    [users]
  );

  const renderAction = useCallback((cell) => {
    const action = cell.data.action;
    const tone = ACTION_TONE[action] || cell.data.category;
    return <span className={`audit-badge audit-badge-${tone}`}>{ACTION_LABEL[action] || action}</span>;
  }, []);

  // The summary, with links to the item and company it was about - the drill-down pages.
  const renderSummary = useCallback((cell) => {
    const r = cell.data;
    return (
      <span className="audit-summary">
        <span>{r.summary}</span>
        {r.distributorStockId && (
          <Link className="audit-link" to={`/items/${r.distributorStockId}`}>
            item
          </Link>
        )}
        {r.companyId && (
          <Link className="audit-link" to={`/companies/${r.companyId}`}>
            company
          </Link>
        )}
      </span>
    );
  }, []);

  // Only a row that changed fields can be expanded - the others have nothing more to show.
  const onCellPrepared = useCallback((e) => {
    if (e.rowType === "data" && e.column.command === "expand" && !(e.data.changes || []).length) {
      e.cellElement.classList.remove("dx-datagrid-expand");
      e.cellElement.innerHTML = "";
    }
  }, []);

  // MasterDetail's render gets { data: <the row>, key } - the row itself, not a wrapper around it.
  const renderChanges = useCallback(({ data }) => {
    const changes = data?.changes || [];
    if (!changes.length) return null;
    const isNew = changes.every((c) => c.before == null);
    return (
      <table className="audit-changes">
        <thead>
          <tr>
            <th scope="col">Field</th>
            {!isNew && <th scope="col">Before</th>}
            <th scope="col">{isNew ? "Set to" : "After"}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.field}>
              <td className="audit-field">{c.field}</td>
              {!isNew && <td className="audit-before">{c.before ?? <span className="ci-muted">(blank)</span>}</td>}
              <td className="audit-after">{c.after ?? <span className="ci-muted">(blank)</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }, []);

  return (
    // .home for the range buttons' colours, .ci-page for the window-filling layout.
    <div className="home ci-page audit-page">
      <div className="home-filters">
        <RangeButtons value={rangeKey} onChange={setRangeKey} />
        <div className="audit-count" role="status">
          <span className="audit-count-dot" aria-hidden="true" />
          {loading && total === null
            ? "Loading..."
            : `${(total ?? 0).toLocaleString("en-MY")} entr${total === 1 ? "y" : "ies"}`}
        </div>
      </div>

      <div className="ci-card">
        <div className="ci-toolbar">
          <div className="ci-views" role="tablist" aria-label="Show">
            {CATEGORIES.map((c) => (
              <button
                key={c.key || "all"}
                type="button"
                role="tab"
                aria-selected={category === c.key}
                className={"ci-view" + (category === c.key ? " ci-view-on" : "")}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="ci-tools">
            {/* Who and what, in one grey bar: the user picker on a white pill, then the search. */}
            <div className="audit-filters">
              <SelectBox
                className="audit-user"
                dataSource={userChoices}
                valueExpr="userId"
                displayExpr="label"
                value={userId}
                width={150}
                placeholder="All users"
                stylingMode="filled"
                inputAttr={{ "aria-label": "User" }}
                onSelectionChanged={(e) => {
                  // Lookups report a user pick through onSelectionChanged, not onValueChanged.
                  if (e.selectedItem) setUserId(e.selectedItem.userId);
                }}
              />
              <label className="audit-search">
                <Icon name="search" size={17} />
                <input
                  type="search"
                  placeholder="Search what changed"
                  aria-label="Search what changed"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </label>
            </div>
            <button type="button" className="gp-icon-btn" title="Reload" aria-label="Reload" onClick={reload}>
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </div>

        <div className="ci-grid-wrap">
          <DataGrid
            ref={grid}
            className="ci-grid ci-grid-roomy"
            dataSource={dataSource}
            remoteOperations={REMOTE_OPERATIONS}
            showBorders={false}
            showColumnLines={false}
            showRowLines={false}
            hoverStateEnabled={true}
            columnAutoWidth={false}
            columnHidingEnabled={true}
            noDataText="Nothing logged for this range and these filters."
            onCellPrepared={onCellPrepared}
            height="100%"
          >
            <Paging defaultPageSize={DEFAULT_PAGE_SIZE} pageIndex={pageIndex} onPageIndexChange={onPageIndexChange} />
            <Pager
              visible={true}
              allowedPageSizes={PAGE_SIZES}
              showPageSizeSelector={true}
              showInfo={true}
              showNavigationButtons={true}
              displayMode="full"
            />
            <MasterDetail enabled={true} render={renderChanges} />

            <Column dataField="createdDate" caption="When" width={170} allowSorting={false} cellRender={renderWhen} />
            <Column dataField="username" caption="User" width={140} allowSorting={false} />
            <Column
              dataField="action"
              caption="Action"
              width={140}
              allowSorting={false}
              cellRender={renderAction}
              calculateDisplayValue={actionDisplayValue}
            />
            <Column dataField="summary" caption="What" minWidth={260} allowSorting={false} cellRender={renderSummary} />
            <Column dataField="ipAddress" caption="IP address" width={130} hidingPriority={0} allowSorting={false} />
          </DataGrid>
        </div>
      </div>
    </div>
  );
}
