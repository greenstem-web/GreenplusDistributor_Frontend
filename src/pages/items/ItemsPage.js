import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DataGrid, { Column, Paging, Scrolling, SearchPanel } from "devextreme-react/data-grid";
import Popup from "devextreme-react/popup";
import Switch from "devextreme-react/switch";
import TextArea from "devextreme-react/text-area";
import TextBox from "devextreme-react/text-box";
import SelectBox from "devextreme-react/select-box";
import LoadPanel from "devextreme-react/load-panel";
import NumberBox from "devextreme-react/number-box";
import notify from "devextreme/ui/notify";
import { confirm } from "devextreme/ui/dialog";
import * as catalogApi from "../../api/catalog";
import { describeError } from "../../api/baseapi";
import ImportItemsPopup from "./ImportItemsPopup";
import FieldError from "../../components/FieldError";
import { caretBeforeDecimals } from "../../components/numberBoxCaret";
import Icon from "../../components/Icon";
import { PageActions } from "../../layouts/AppShell";
import "./items.css";

/**
 * A new item, published and visible unless the distributor says otherwise — the same defaults the
 * API applies when a field is omitted, kept in step here so the form shows what will be saved.
 */
const BLANK = {
  distributorStockId: 0,
  code: "",
  name: "",
  description: "",
  uom: "",
  barcode: "",
  cost: 0,
  price: 0,
  warningQuantity: null,
  defaultVisible: true,
  active: true,
};

/** Yes / No with a dot - green for yes, grey for no. Words as well as colour. */
function renderFlag(cell) {
  const on = cell.value === true;
  return (
    <span className={on ? "items-flag items-flag-on" : "items-flag items-flag-off"}>
      <span className="items-dot" aria-hidden="true" />
      {on ? "Yes" : "No"}
    </span>
  );
}

const quantity = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });

/** The warning quantity on an amber pill; a dash when the item has none (no low-stock warning). */
function renderWarning(cell) {
  if (cell.value == null) return <span className="items-none" title="No low-stock warning">-</span>;
  return <span className="items-warn">{quantity.format(cell.value)}</span>;
}

/** "PCS - PIECE" in the UOM drop-down; just the code when the name says nothing more. */
function uomLabel(uom) {
  if (!uom) return "";
  return uom.name && uom.name !== uom.code ? `${uom.code} - ${uom.name}` : uom.code;
}

/**
 * The distributor's own catalog: add, edit and withdraw the items companies adopt.
 *
 * Deliberately a separate screen from the per-company visibility grid. That one asks "what may THIS
 * company use" and is meaningless without a company selected; this one asks "what do I publish" and
 * is the same for every viewer. One screen doing both would need the company picker to be optional,
 * and half its columns would blank out depending on the answer.
 *
 * The form is hand-rolled rather than DataGrid's built-in popup editing. The grid's editing
 * lifecycle hands an update only the CHANGED fields, while the API takes a whole item and writes
 * every field it is given — so the two disagree in the one place where being wrong silently clears
 * a description nobody touched.
 */
export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [importing, setImporting] = useState(false);
  // The search box above the grid; the grid's own search panel does the matching, hidden.
  const [search, setSearch] = useState("");
  // How many rows the search leaves, for the footer.
  const [shown, setShown] = useState(0);

  const [editing, setEditing] = useState(null); // null = the form is closed
  const [saving, setSaving] = useState(false);
  // A refusal that is about no field in particular (the API was unreachable, say) - at the top.
  const [formError, setFormError] = useState(null);
  // The rest go under the field they are about: { code: "...", uom: "..." }.
  const [fieldErrors, setFieldErrors] = useState({});

  // Bring the first problem into view - Save is at the bottom of a long form, and a message that
  // is scrolled away looks as if Save did nothing.
  // Deferred: the popup renders its content after this effect runs, so the message is not there yet.
  useEffect(() => {
    if (!formError && Object.keys(fieldErrors).length === 0) return undefined;
    const timer = setTimeout(
      () =>
        document
          .querySelector(".items-popup .items-form-error, .items-popup .items-field-error")
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      50
    );
    return () => clearTimeout(timer);
  }, [formError, fieldErrors]);

  // So a slow list request for "all items" cannot land after the user has switched back and
  // repaint the grid with rows the filter excludes.
  const request = useRef(0);

  const fail = useCallback((error, fallback) => {
    notify({ message: describeError(error, fallback).message, type: "error", displayTime: 6000 }, "error", 6000);
  }, []);

  const load = useCallback(
    (withInactive) => {
      const seq = ++request.current;
      setLoading(true);

      catalogApi
        .getItems(withInactive)
        .then((rows) => {
          if (seq === request.current) setItems(rows);
        })
        .catch((error) => {
          if (seq === request.current) {
            setItems([]);
            fail(error, "Could not load your catalog.");
          }
        })
        .finally(() => {
          if (seq === request.current) setLoading(false);
        });
    },
    [fail]
  );

  useEffect(() => {
    load(includeInactive);
  }, [includeInactive, load]);

  // The predefined UOM list (maintained by Greenplus), for the form's drop-down - re-read each time
  // the form opens, so a unit Greenplus has just added is there.
  const [uoms, setUoms] = useState([]);
  const loadUoms = useCallback(() => {
    catalogApi
      .getUoms()
      .then(setUoms)
      .catch(() => setUoms([]));
  }, []);

  useEffect(() => {
    loadUoms();
  }, [loadUoms]);

  // The list, plus the item's own UOM when it is not on it (switched off, or older than the list) -
  // the API still accepts an item's current UOM, so editing its price never forces a UOM change.
  const uomOptions = useMemo(() => {
    const current = (editing?.uom || "").trim().toUpperCase();
    if (!current || uoms.some((u) => u.code.toUpperCase() === current)) return uoms;
    return [{ code: current, name: `${current} (not on the list)` }, ...uoms];
  }, [uoms, editing?.uom]);

  const startAdd = useCallback(() => {
    setFormError(null);
    setFieldErrors({});
    loadUoms();
    setEditing({ ...BLANK });
  }, [loadUoms]);

  const startEdit = useCallback((row) => {
    setFormError(null);
    setFieldErrors({});
    loadUoms();
    // Copied, not referenced: the form edits its own object so Cancel really cancels and the grid
    // row behind the popup does not change as the user types.
    setEditing({
      ...BLANK,
      ...row,
      description: row.description || "",
      uom: row.uom || "",
      barcode: row.barcode || "",
      cost: row.cost ?? 0,
      price: row.price ?? 0,
      warningQuantity: row.warningQuantity ?? null,
    });
  }, [loadUoms]);

  const field = useCallback((name, value) => {
    setEditing((current) => (current ? { ...current, [name]: value } : current));
    // Editing a field answers its message - it goes until the next Save says otherwise.
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _answered, ...rest } = current;
      return rest;
    });
  }, []);

  const save = useCallback(async () => {
    if (!editing || saving) return;

    // Checked here as well as on the server so the answer is instant and lands next to the field -
    // ALL of them at once, not one per Save. The server checks again regardless.
    const problems = {};
    if (!editing.code.trim()) problems.code = "Code is required.";
    if (!editing.name.trim()) problems.name = "Name is required — it is what each company sees in its own stock list.";
    if (!(editing.uom || "").trim()) problems.uom = "UOM is required — the unit every company records this item in.";
    if ((editing.cost ?? 0) < 0) problems.cost = "Cost cannot be negative.";
    if ((editing.price ?? 0) < 0) problems.price = "Price cannot be negative.";
    if ((editing.warningQuantity ?? 0) < 0) problems.warningQuantity = "Warning quantity cannot be negative.";

    setFieldErrors(problems);
    setFormError(null);
    if (Object.keys(problems).length > 0) return;

    setSaving(true);

    const payload = {
      code: editing.code,
      name: editing.name,
      description: editing.description,
      uom: editing.uom,
      barcode: editing.barcode,
      // A cleared NumberBox gives null; the API wants a number.
      cost: editing.cost ?? 0,
      price: editing.price ?? 0,
      // Unlike cost and price, blank MEANS something here: no low-stock warning for the item.
      warningQuantity: editing.warningQuantity ?? null,
      defaultVisible: editing.defaultVisible,
      active: editing.active,
    };

    try {
      const isNew = !editing.distributorStockId;
      const saved = isNew
        ? await catalogApi.createItem(payload)
        : await catalogApi.updateItem(editing.distributorStockId, payload);

      // Patch from the RESPONSE. The server trims and upper-cases the code and turns blank optional
      // fields into null, so the form values are not what was stored.
      setItems((current) => {
        const without = current.filter((x) => x.distributorStockId !== saved.distributorStockId);

        // An item switched off drops out of the grid unless inactive rows are being shown — putting
        // it back would leave a row the current filter says should not be there.
        if (!saved.active && !includeInactive) return without;

        return [...without, saved].sort((a, b) => a.code.localeCompare(b.code));
      });

      notify({ message: `${saved.code} saved.`, type: "success", displayTime: 2500 }, "success", 2500);
      setEditing(null);
    } catch (error) {
      // Stays in the form, with the reason beside the fields, so nothing typed is lost. A duplicate
      // code (409) is the common one and is entirely fixable without reopening anything.
      // The API names the field when the refusal is about one (a duplicate code, a UOM not on the list).
      const message = describeError(error, "Could not save this item.").message;
      const onField = error?.response?.data?.field;
      if (onField) setFieldErrors({ [onField]: message });
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  }, [editing, includeInactive, saving]);

  const remove = useCallback(
    async (row) => {
      const yes = await confirm(
        `Withdraw <b>${row.code}</b> from your catalog?<br/><br/>Companies that already adopted it keep ` +
          "their stock and history — it simply stops being offered.",
        "Withdraw item"
      );
      if (!yes) return;

      try {
        await catalogApi.deleteItem(row.distributorStockId);
        setItems((current) => current.filter((x) => x.distributorStockId !== row.distributorStockId));
        notify({ message: `${row.code} withdrawn.`, type: "success", displayTime: 2500 }, "success", 2500);
      } catch (error) {
        fail(error, "Could not withdraw this item.");
      }
    },
    [fail]
  );

  const renderActions = useCallback(
    (cell) => (
      <div className="items-actions">
        <button
          type="button"
          className="items-action items-action-edit"
          title="Edit"
          aria-label={`Edit ${cell.data.code}`}
          onClick={() => startEdit(cell.data)}
        >
          <Icon name="pencil" size={17} />
        </button>
        <button
          type="button"
          className="items-action items-action-remove"
          title="Withdraw"
          aria-label={`Withdraw ${cell.data.code}`}
          onClick={() => remove(cell.data)}
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
    ),
    [remove, startEdit]
  );

  // The search matches against what the grid holds; the footer says how many rows it left.
  const onContentReady = useCallback((e) => setShown(e.component.totalCount()), []);

  // Remembered from the last time the form was open, so the title and button do not flip to "Edit"
  // while the popup fades out after Cancel (editing is already null by then).
  const lastIsNew = useRef(false);
  if (editing !== null) lastIsNew.current = !editing.distributorStockId;
  const isNew = lastIsNew.current;
  const title = useMemo(() => (isNew ? "New catalog item" : "Edit catalog item"), [isNew]);

  return (
    <div className="items-page">
      <PageActions>
        <button type="button" className="page-btn" onClick={() => setImporting(true)}>
          <Icon name="upload" size={17} />
          Import from Excel
        </button>
        <button type="button" className="page-btn page-btn-primary" onClick={startAdd}>
          <Icon name="plus" size={17} strokeWidth={2.2} />
          Add item
        </button>
      </PageActions>

      <div className="items-card">
        <div className="items-toolbar">
          <label className="gp-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              placeholder="Search code or name"
              aria-label="Search code or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="items-filter">
            <Switch
              value={includeInactive}
              switchedOnText=""
              switchedOffText=""
              onValueChanged={(e) => {
                // DevExtreme fires this for programmatic changes too; only a real click should reload.
                if (!e.event) return;
                setIncludeInactive(e.value);
              }}
            />
            {/* The words flip it too - DevExtreme's switch has no real checkbox for a label to drive.
                Keyboard users have the switch itself. */}
            <span className="items-filter-label" onClick={() => setIncludeInactive((v) => !v)}>
              Show inactive items
            </span>
          </div>
        </div>

        <div className="items-grid">
          <DataGrid
            className="items-datagrid"
            dataSource={items}
            keyExpr="distributorStockId"
            showBorders={false}
            showColumnLines={false}
            showRowLines={false}
            hoverStateEnabled={true}
            // Fixed widths with Name taking what is left, and the least-needed columns folding into the
            // row detail ("...") when the screen is too narrow - auto widths pushed the last columns, and
            // the edit buttons, off the right beside the menu.
            columnAutoWidth={false}
            columnHidingEnabled={true}
            noDataText={loading ? "" : search ? "No item matches this search." : "You have not published any catalog items yet."}
            onContentReady={onContentReady}
            height="100%"
          >
            <SearchPanel visible={false} text={search} />
            <Scrolling mode="virtual" />
            <Paging enabled={false} />

            <Column
              dataField="code"
              caption="Code"
              width={170}
              cellRender={(cell) => (
                <Link className="items-code entity-link" to={`/items/${cell.data.distributorStockId}`}>
                  {cell.value}
                </Link>
              )}
            />
            <Column dataField="name" caption="Name" minWidth={200} />
            <Column dataField="uom" caption="UOM" width={110} hidingPriority={3} />
            <Column dataField="barcode" caption="Barcode" width={145} hidingPriority={1} />
            <Column dataField="cost" caption="Cost" dataType="number" format="#,##0.00" width={95} alignment="left" />
            <Column dataField="price" caption="Price" dataType="number" format="#,##0.00" width={100} alignment="left" />
            <Column
              dataField="warningQuantity"
              caption="Warning qty"
              dataType="number"
              width={120}
              alignment="left"
              hidingPriority={2}
              cellRender={renderWarning}
            />
            <Column dataField="defaultVisible" caption="Visible by default" width={148} cellRender={renderFlag} />
            <Column dataField="active" caption="Active" width={116} cellRender={renderFlag} />
            <Column dataField="modifiedDate" caption="Modified" dataType="date" format="dd/MM/yyyy" width={115} hidingPriority={0} />
            <Column
              caption=""
              width={96}
              allowSorting={false}
              allowFiltering={false}
              allowSearch={false}
              cellRender={renderActions}
            />
          </DataGrid>
        </div>

        <div className="items-foot">
          <span>
            Showing {shown.toLocaleString("en-MY")} of {items.length.toLocaleString("en-MY")} item{items.length === 1 ? "" : "s"} · cost and
            price in RM
          </span>
          <span>{includeInactive ? "Inactive items are included" : "Inactive items are hidden unless you switch them on"}</span>
        </div>
      </div>

      <Popup
        visible={editing !== null}
        onHiding={() => setEditing(null)}
        title={title}
        width={1040}
        maxWidth="94vw"
        height="auto"
        maxHeight="90vh"
        showCloseButton={true}
        dragEnabled={false}
        hideOnOutsideClick={false}
        wrapperAttr={{ class: "items-popup" }}
        // contentRender, NOT children, and no ScrollView inside. Children mounted as the popup opens
        // are laid out before its content area has its size, and a ScrollView at height 100% inside
        // an auto-height popup measures a height that depends on itself - together they opened the
        // form with a tall blank band above it and a stray scrollbar. The content area scrolls on
        // its own (items.css) once the form is taller than maxHeight.
        contentRender={() =>
          editing && (
            <div className="items-form">
              {formError && <div className="items-form-error">{formError}</div>}

              <label className="items-label" htmlFor="item-code">
                Code <span className="items-required" aria-hidden="true">*</span>
              </label>
              {/* valueChangeEvent="input" everywhere: DevExtreme commits a TextBox on blur by
                  default, so a click straight from the last field onto Save would submit the value
                  before it, not the one on screen. */}
              <TextBox
                inputAttr={{ id: "item-code" }}
                className="items-upper"
                value={editing.code}
                valueChangeEvent="input"
                // 20: the company's stock code column (T_Stock.Code) every item is copied into.
                maxLength={20}
                placeholder="e.g. DT-001"
                isValid={!fieldErrors.code}
                onValueChanged={(e) => field("code", e.value)}
              />
              <FieldError message={fieldErrors.code} />
              <div className="items-hint">Up to 20 characters, unique within your catalog. Code, name, description and UOM are saved in capitals.</div>

              <label className="items-label" htmlFor="item-name">
                Name <span className="items-required" aria-hidden="true">*</span>
              </label>
              <TextBox
                inputAttr={{ id: "item-name" }}
                className="items-upper"
                value={editing.name}
                valueChangeEvent="input"
                maxLength={255}
                isValid={!fieldErrors.name}
                onValueChanged={(e) => field("name", e.value)}
              />
              <FieldError message={fieldErrors.name} />

              <label className="items-label" htmlFor="item-description">
                Description
              </label>
              <TextArea
                inputAttr={{ id: "item-description" }}
                className="items-upper"
                value={editing.description}
                valueChangeEvent="input"
                height={120}
                onValueChanged={(e) => field("description", e.value)}
              />

              <div className="items-form-row">
                <div className="items-form-col">
                  <label className="items-label" htmlFor="item-uom">
                    UOM <span className="items-required" aria-hidden="true">*</span>
                  </label>
                  <SelectBox
                    inputAttr={{ id: "item-uom" }}
                    dataSource={uomOptions}
                    valueExpr="code"
                    displayExpr={uomLabel}
                    value={editing.uom ? editing.uom.toUpperCase() : null}
                    searchEnabled={true}
                    searchExpr={["code", "name"]}
                    placeholder="Choose a UOM (required)"
                    noDataText="No UOM matches"
                    isValid={!fieldErrors.uom}
                    onValueChanged={(e) => field("uom", e.value || "")}
                  />
                  <FieldError message={fieldErrors.uom} />
                  <div className="items-hint">
                    From the standard UOM list. Missing a unit? Ask Greenplus to add it. Added to a
                    company's UOM list if it does not have it yet.
                  </div>
                </div>
                <div className="items-form-col">
                  <label className="items-label" htmlFor="item-barcode">
                    Barcode
                  </label>
                  <TextBox
                    inputAttr={{ id: "item-barcode" }}
                    value={editing.barcode}
                    valueChangeEvent="input"
                    maxLength={100}
                    isValid={!fieldErrors.barcode}
                    onValueChanged={(e) => field("barcode", e.value)}
                  />
                  <FieldError message={fieldErrors.barcode} />
                </div>
              </div>

              <div className="items-form-row">
                <div className="items-form-col">
                  <label className="items-label" htmlFor="item-cost">
                    Cost
                  </label>
                  <NumberBox
                    inputAttr={{ id: "item-cost" }}
                    onContentReady={caretBeforeDecimals}
                    value={editing.cost}
                    min={0}
                    format="#,##0.00"
                    valueChangeEvent="keyup"
                    isValid={!fieldErrors.cost}
                    onValueChanged={(e) => field("cost", e.value)}
                  />
                  <FieldError message={fieldErrors.cost} />
                  <div className="items-hint">What a company pays you for it.</div>
                </div>
                <div className="items-form-col">
                  <label className="items-label" htmlFor="item-price">
                    Price
                  </label>
                  <NumberBox
                    inputAttr={{ id: "item-price" }}
                    onContentReady={caretBeforeDecimals}
                    value={editing.price}
                    min={0}
                    format="#,##0.00"
                    valueChangeEvent="keyup"
                    isValid={!fieldErrors.price}
                    onValueChanged={(e) => field("price", e.value)}
                  />
                  <FieldError message={fieldErrors.price} />
                  <div className="items-hint">The selling price on a company's documents.</div>
                </div>
              </div>

              <label className="items-label" htmlFor="item-warning">
                Warning Quantity
              </label>
              <NumberBox
                inputAttr={{ id: "item-warning" }}
                value={editing.warningQuantity}
                min={0}
                format="#,##0.##"
                placeholder="No warning"
                showClearButton={true}
                valueChangeEvent="keyup"
                isValid={!fieldErrors.warningQuantity}
                onValueChanged={(e) => field("warningQuantity", e.value)}
              />
              <FieldError message={fieldErrors.warningQuantity} />
              <div className="items-hint">
                A company holding this many or fewer shows as low on stock on your home page. Leave
                blank for no warning.
              </div>

              <div className="items-toggle">
                <Switch value={editing.defaultVisible} onValueChanged={(e) => field("defaultVisible", e.value)} />
                <div>
                  <div className="items-toggle-label">Visible by default</div>
                  <div className="items-hint">
                    What a company sees unless you have set an override for it on the Visibility
                    screen. Changing this does not touch those overrides.
                  </div>
                </div>
              </div>

              <div className="items-toggle">
                <Switch value={editing.active} onValueChanged={(e) => field("active", e.value)} />
                <div>
                  <div className="items-toggle-label">Active</div>
                  <div className="items-hint">
                    Switching this off withdraws the item from every company at once, keeping each
                    company's override so turning it back on restores exactly what was there before.
                  </div>
                </div>
              </div>

              {/* Pinned to the foot of the popup, so Save is in reach however long the form. */}
              <div className="items-form-buttons">
                <button type="button" className="page-btn page-btn-muted" disabled={saving} onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="page-btn page-btn-primary" disabled={saving} onClick={save}>
                  <Icon name={isNew ? "plus" : "check"} size={17} strokeWidth={2.2} />
                  {saving ? "Saving..." : isNew ? "Add item" : "Save changes"}
                </button>
              </div>
            </div>
          )
        }
      />

      <ImportItemsPopup visible={importing} onClose={() => setImporting(false)} onImported={() => load(includeInactive)} />

      <LoadPanel visible={loading} showPane={true} position={{ of: ".items-page" }} />
    </div>
  );
}
