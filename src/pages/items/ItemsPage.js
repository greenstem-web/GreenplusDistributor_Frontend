import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataGrid, { Column, HeaderFilter, Paging, Scrolling, SearchPanel } from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import Popup from "devextreme-react/popup";
import ScrollView from "devextreme-react/scroll-view";
import Switch from "devextreme-react/switch";
import TextArea from "devextreme-react/text-area";
import TextBox from "devextreme-react/text-box";
import LoadPanel from "devextreme-react/load-panel";
import notify from "devextreme/ui/notify";
import { confirm } from "devextreme/ui/dialog";
import * as catalogApi from "../../api/catalog";
import { describeError } from "../../api/baseapi";
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
  defaultVisible: true,
  active: true,
};

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

  const [editing, setEditing] = useState(null); // null = the form is closed
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

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

  const startAdd = useCallback(() => {
    setFormError(null);
    setEditing({ ...BLANK });
  }, []);

  const startEdit = useCallback((row) => {
    setFormError(null);
    // Copied, not referenced: the form edits its own object so Cancel really cancels and the grid
    // row behind the popup does not change as the user types.
    setEditing({
      ...BLANK,
      ...row,
      description: row.description || "",
      uom: row.uom || "",
      barcode: row.barcode || "",
    });
  }, []);

  const field = useCallback((name, value) => {
    setEditing((current) => (current ? { ...current, [name]: value } : current));
  }, []);

  const save = useCallback(async () => {
    if (!editing || saving) return;

    // Checked here as well as on the server so the answer is instant and lands next to the field.
    // The server checks again regardless — this is a convenience, not the rule.
    if (!editing.code.trim()) {
      setFormError("Code is required.");
      return;
    }
    if (!editing.name.trim()) {
      setFormError("Name is required — it is what each company sees in its own stock list.");
      return;
    }

    setFormError(null);
    setSaving(true);

    const payload = {
      code: editing.code,
      name: editing.name,
      description: editing.description,
      uom: editing.uom,
      barcode: editing.barcode,
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
      setFormError(describeError(error, "Could not save this item.").message);
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

  const renderFlag = useCallback((cell) => {
    const on = cell.value === true;
    return <span className={on ? "items-flag-on" : "items-flag-off"}>{on ? "Yes" : "No"}</span>;
  }, []);

  const renderActions = useCallback(
    (cell) => (
      <div className="items-actions">
        <Button icon="edit" hint="Edit" stylingMode="text" onClick={() => startEdit(cell.data)} />
        <Button icon="trash" hint="Withdraw" stylingMode="text" type="danger" onClick={() => remove(cell.data)} />
      </div>
    ),
    [remove, startEdit]
  );

  const isNew = editing !== null && !editing.distributorStockId;
  const title = useMemo(() => (isNew ? "New catalog item" : "Edit catalog item"), [isNew]);

  return (
    <div className="items-page">
      <div className="items-toolbar">
        <Button icon="plus" text="Add item" type="default" onClick={startAdd} />

        <div className="items-filter">
          <Switch
            value={includeInactive}
            onValueChanged={(e) => {
              // DevExtreme fires this for programmatic changes too; only a real click should reload.
              if (!e.event) return;
              setIncludeInactive(e.value);
            }}
          />
          <span className="items-filter-label">Show inactive items</span>
        </div>
      </div>

      <DataGrid
        className="listing-datagrid"
        dataSource={items}
        keyExpr="distributorStockId"
        showBorders={true}
        columnAutoWidth={true}
        rowAlternationEnabled={true}
        noDataText={loading ? "" : "You have not published any catalog items yet."}
        height="calc(100vh - 210px)"
      >
        <SearchPanel visible={true} width={260} placeholder="Search code or name" />
        <HeaderFilter visible={true} />
        <Scrolling mode="virtual" />
        <Paging enabled={false} />

        <Column dataField="code" caption="Code" width={140} />
        <Column dataField="name" caption="Name" />
        <Column dataField="uom" caption="UOM" width={90} alignment="center" />
        <Column dataField="barcode" caption="Barcode" width={150} />
        <Column
          dataField="defaultVisible"
          caption="Visible by default"
          width={140}
          alignment="center"
          cellRender={renderFlag}
        />
        <Column dataField="active" caption="Active" width={90} alignment="center" cellRender={renderFlag} />
        <Column
          dataField="modifiedDate"
          caption="Modified"
          dataType="date"
          format="dd/MM/yyyy"
          width={110}
          alignment="center"
        />
        <Column
          caption=""
          width={90}
          allowSorting={false}
          allowFiltering={false}
          allowSearch={false}
          cellRender={renderActions}
        />
      </DataGrid>

      <Popup
        visible={editing !== null}
        onHiding={() => setEditing(null)}
        title={title}
        width={560}
        height="auto"
        showCloseButton={true}
        dragEnabled={false}
        hideOnOutsideClick={false}
      >
        <ScrollView height="100%">
          {editing && (
            <div className="items-form">
              {formError && <div className="items-form-error">{formError}</div>}

              <label className="items-label" htmlFor="item-code">
                Code
              </label>
              {/* valueChangeEvent="input" everywhere: DevExtreme commits a TextBox on blur by
                  default, so a click straight from the last field onto Save would submit the value
                  before it, not the one on screen. */}
              <TextBox
                inputAttr={{ id: "item-code" }}
                value={editing.code}
                valueChangeEvent="input"
                maxLength={50}
                placeholder="e.g. DT-001"
                onValueChanged={(e) => field("code", e.value)}
              />
              <div className="items-hint">Saved in upper case. It has to be unique within your catalog.</div>

              <label className="items-label" htmlFor="item-name">
                Name
              </label>
              <TextBox
                inputAttr={{ id: "item-name" }}
                value={editing.name}
                valueChangeEvent="input"
                maxLength={255}
                onValueChanged={(e) => field("name", e.value)}
              />

              <label className="items-label" htmlFor="item-description">
                Description
              </label>
              <TextArea
                inputAttr={{ id: "item-description" }}
                value={editing.description}
                valueChangeEvent="input"
                height={80}
                onValueChanged={(e) => field("description", e.value)}
              />

              <div className="items-form-row">
                <div className="items-form-col">
                  <label className="items-label" htmlFor="item-uom">
                    UOM
                  </label>
                  <TextBox
                    inputAttr={{ id: "item-uom" }}
                    value={editing.uom}
                    valueChangeEvent="input"
                    maxLength={50}
                    onValueChanged={(e) => field("uom", e.value)}
                  />
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
                    onValueChanged={(e) => field("barcode", e.value)}
                  />
                </div>
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

              <div className="items-form-buttons">
                <Button text="Cancel" stylingMode="outlined" disabled={saving} onClick={() => setEditing(null)} />
                <Button
                  text={saving ? "Saving..." : "Save"}
                  type="default"
                  disabled={saving}
                  onClick={save}
                />
              </div>
            </div>
          )}
        </ScrollView>
      </Popup>

      <LoadPanel visible={loading} showPane={true} position={{ of: ".items-page" }} />
    </div>
  );
}
