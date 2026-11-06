import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Popup from "devextreme-react/popup";
import Switch from "devextreme-react/switch";
import DataGrid, { Column, Paging, Scrolling } from "devextreme-react/data-grid";
import LoadPanel from "devextreme-react/load-panel";
import notify from "devextreme/ui/notify";
import * as catalogApi from "../../api/catalog";
import Icon from "../../components/Icon";
import { describeError } from "../../api/baseapi";
import "./importItems.css";

/** What each action reads as, and its colour - the tiles, the filter and the grid badge share it. */
const ACTIONS = {
  add: { label: "New", tone: "add" },
  update: { label: "Update", tone: "update" },
  unchanged: { label: "No change", tone: "same" },
  skip: { label: "Skipped", tone: "same" },
  error: { label: "Error", tone: "error" },
};

/** The summary tiles, which double as the grid's filter. */
const TILES = [
  { key: "add", label: "New", sub: "will be added", tone: "add", icon: "add" },
  { key: "update", label: "Updates", sub: "will change", tone: "update", icon: "edit" },
  { key: "unchanged", label: "No change", sub: "already match", tone: "same", icon: "check" },
  { key: "skip", label: "Skipped", sub: "already in catalog", tone: "same", icon: "clearsquare" },
  { key: "error", label: "Errors", sub: "will be skipped", tone: "error", icon: "warning" },
];

const STEPS = ["Get the sheet", "Upload it", "Review and import"];

/** Hands the browser a Blob as a named download. */
function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const n = (value) => Number(value || 0).toLocaleString("en-MY");

/**
 * Catalog >> Items >> Import: many items from one Excel sheet.
 *
 * 1. Download the template - blank, or with your catalog in it to edit and upload back.
 * 2. Upload it (choose or drop). The API reads every row and says what it would do; NOTHING is
 *    saved yet.
 * 3. Import. Rows with errors are skipped, the rest are saved together.
 *
 * The rules are the Items form's own (the API runs each row through them), so an import cannot
 * create an item the form would refuse.
 */
export default function ImportItemsPopup({ visible, onClose, onImported }) {
  const fileInput = useRef(null);
  const popup = useRef(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(null); // what is running, for the overlay text
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  // The popup is sized to its content before a sheet is read and tall after. DevExtreme measures the
  // content area once, so it is told to measure again whenever the two swap.
  const hasPreview = !!preview;
  useEffect(() => {
    popup.current?.instance()?.repaint();
  }, [hasPreview]);

  const step = preview ? 2 : 1; // zero-based: the upload step is current until a sheet is read

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setFilter("");
    setError(null);
    setDragging(false);
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const download = useCallback(async (withItems) => {
    setBusy("Preparing the file...");
    try {
      const blob = await catalogApi.getImportTemplate(withItems);
      saveBlob(blob, withItems ? `catalog-items-${stamp()}.xlsx` : "catalog-import-template.xlsx");
    } catch (e) {
      notify({ message: describeError(e, "Could not download the file.").message, type: "error", displayTime: 6000 }, "error", 6000);
    } finally {
      setBusy(null);
    }
  }, []);

  const runPreview = useCallback(async (chosen, update) => {
    setBusy("Reading the sheet...");
    setError(null);
    try {
      const result = await catalogApi.previewImport(chosen, update);
      setPreview(result);
      // Errors first when there are any - they are what needs attention.
      setFilter(result.errors > 0 ? "error" : "");
    } catch (e) {
      setPreview(null);
      setError(describeError(e, "Could not read this file.").message);
    } finally {
      setBusy(null);
    }
  }, []);

  const take = useCallback(
    (chosen) => {
      if (!chosen) return;
      if (!/\.xlsx$/i.test(chosen.name)) {
        setError("That is not an Excel workbook (.xlsx). In Excel, use File > Save As > Excel Workbook.");
        return;
      }
      setFile(chosen);
      runPreview(chosen, updateExisting);
    },
    [runPreview, updateExisting]
  );

  const onFileChosen = useCallback((e) => take(e.target.files?.[0]), [take]);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      take(e.dataTransfer?.files?.[0]);
    },
    [take]
  );

  // The switch changes what an existing code does, so the same file is previewed again.
  const onUpdateExistingChanged = useCallback(
    (e) => {
      if (!e.event) return;
      setUpdateExisting(e.value);
      if (file) runPreview(file, e.value);
    },
    [file, runPreview]
  );

  const toImport = preview ? preview.add + preview.update : 0;

  const runImport = useCallback(async () => {
    if (!preview || toImport === 0) return;
    setBusy(`Importing ${n(toImport)} item${toImport === 1 ? "" : "s"}...`);
    setError(null);
    try {
      const result = await catalogApi.importItems(
        preview.rows.map((r) => r.row),
        updateExisting,
        file?.name
      );
      const parts = [`${result.added} added`, `${result.updated} updated`];
      if (result.errors) parts.push(`${result.errors} skipped with errors`);
      notify({ message: `Import done: ${parts.join(", ")}.`, type: "success", displayTime: 5000 }, "success", 5000);
      onImported();
      close();
    } catch (e) {
      setError(describeError(e, "Could not import the items.").message);
    } finally {
      setBusy(null);
    }
  }, [close, file?.name, onImported, preview, toImport, updateExisting]);

  const rows = useMemo(() => {
    if (!preview) return [];
    return preview.rows
      .filter((r) => !filter || r.action === filter)
      .map((r) => ({ ...r.row, action: r.action, errors: r.errors, changes: r.changes }));
  }, [filter, preview]);

  const count = (key) => (!preview ? 0 : preview[key === "error" ? "errors" : key] || 0);

  const renderAction = useCallback((cell) => {
    const a = ACTIONS[cell.value] || { label: cell.value, tone: "same" };
    return <span className={`import-badge import-tone-${a.tone}`}>{a.label}</span>;
  }, []);

  const renderDetails = useCallback((cell) => {
    const r = cell.data;
    const lines = r.action === "error" || r.action === "skip" ? r.errors : r.changes;
    if (!lines?.length) return null;
    return (
      <ul className={r.action === "error" ? "import-lines import-lines-error" : "import-lines"}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    );
  }, []);

  const steps = (
    <ol className="import-stepper" aria-label="Steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={"import-stepper-item" + (i < step ? " is-done" : "") + (i === step ? " is-current" : "")}
          aria-current={i === step ? "step" : undefined}
        >
          <span className="import-stepper-dot">{i < step ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}</span>
          <span className="import-stepper-label">{label}</span>
        </li>
      ))}
    </ol>
  );

  const fileInputEl = <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={onFileChosen} />;

  // ---------------------------------------------------------------- before a sheet is read
  const start = (
    <div className="import-start">
      <section className="import-card import-card-get">
        <h3 className="import-card-title">
          <span className="import-card-num">1</span> Get the sheet
        </h3>
        <div className="import-downloads">
          <button type="button" className="import-download" onClick={() => download(false)}>
            <span className="import-download-icon import-download-icon-green">
              <Icon name="document" size={20} />
            </span>
            <span className="import-download-text">
              <span className="import-download-title">Blank template</span>
              <span className="import-download-sub">The columns, a UOM list and the rules</span>
            </span>
            <Icon className="import-download-go" name="download" size={19} />
          </button>
          <button type="button" className="import-download" onClick={() => download(true)}>
            <span className="import-download-icon import-download-icon-blue">
              <Icon name="cube" size={20} />
            </span>
            <span className="import-download-text">
              <span className="import-download-title">My items, to edit</span>
              <span className="import-download-sub">Your whole catalog - change it and upload it back</span>
            </span>
            <Icon className="import-download-go" name="download" size={19} />
          </button>
        </div>

        <ul className="import-rules">
          <li>
            <b>Code</b> finds the item - a code already in your catalog updates it, a new one adds it.
          </li>
          <li>
            A <b>blank cell</b> leaves that value as it is, so keep only the columns you are changing.
          </li>
          <li>
            New items need <b>Name</b> and a <b>UOM</b> from the list.
          </li>
        </ul>
      </section>

      <section className="import-card">
        <h3 className="import-card-title">
          <span className="import-card-num">2</span> Upload it
        </h3>
        <div
          className={"import-drop" + (dragging ? " is-dragging" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          aria-label="Choose an Excel file to upload"
        >
          <span className="import-drop-icon">
            <Icon name="upload" size={26} strokeWidth={2} />
          </span>
          <span className="import-drop-title">{dragging ? "Drop it here" : "Drag your .xlsx here"}</span>
          <span className="import-drop-or">
            or <span className="import-drop-link">choose a file</span>
          </span>
          <span className="import-drop-note">Up to 5,000 rows. Nothing is saved until you review it.</span>
          {fileInputEl}
        </div>

        <label className="import-toggle import-toggle-panel">
          <Switch value={updateExisting} switchedOnText="" switchedOffText="" onValueChanged={onUpdateExistingChanged} />
          <span>
            <span className="import-toggle-title">Update items already in my catalog</span>
            <span className="import-toggle-sub">Off: rows with an existing code are skipped, only new codes are added.</span>
          </span>
        </label>
      </section>
    </div>
  );

  // ---------------------------------------------------------------- after a sheet is read
  const review = preview && (
    <>
      <div className="import-filebar">
        <i className="dx-icon dx-icon-xlsxfile import-filebar-icon" aria-hidden="true" />
        <div className="import-filebar-text">
          <div className="import-filebar-name">{file?.name}</div>
          <div className="import-filebar-sub">
            {n(preview.rows.length)} row{preview.rows.length === 1 ? "" : "s"} read{file ? ` · ${fileSize(file.size)}` : ""}
          </div>
        </div>
        <label className="import-toggle import-toggle-inline">
          <Switch value={updateExisting} switchedOnText="" switchedOffText="" onValueChanged={onUpdateExistingChanged} />
          <span className="import-toggle-title">Update existing items</span>
        </label>
        <button type="button" className="page-btn" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={16} />
          Another file
        </button>
        {fileInputEl}
      </div>

      <div className="import-tiles" role="tablist" aria-label="Show">
        {TILES.filter((t) => t.key !== "skip" || count("skip") > 0).map((t) => {
          const on = filter === t.key;
          const value = count(t.key);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              className={`import-tile import-tone-${t.tone}` + (on ? " is-on" : "") + (value === 0 ? " is-zero" : "")}
              onClick={() => setFilter(on ? "" : t.key)}
              title={on ? "Show all rows" : `Show only: ${t.label}`}
            >
              <i className={`dx-icon dx-icon-${t.icon} import-tile-icon`} aria-hidden="true" />
              <span className="import-tile-value">
                {n(value)} <span className="import-tile-label">{t.label}</span>
              </span>
              <span className="import-tile-sub">{t.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="import-grid">
        <DataGrid
          dataSource={rows}
          keyExpr="rowNumber"
          showBorders={true}
          showRowLines={true}
          showColumnLines={false}
          columnAutoWidth={false}
          wordWrapEnabled={true}
          noDataText={filter ? "No rows like this." : "No rows."}
          height="100%"
        >
          <Scrolling mode="virtual" />
          <Paging enabled={false} />
          <Column dataField="rowNumber" caption="Row" width={60} alignment="center" />
          <Column dataField="code" caption="Code" width={130} />
          <Column dataField="name" caption="Name" minWidth={170} />
          <Column dataField="uom" caption="UOM" width={70} />
          <Column dataField="price" caption="Price" width={85} alignment="right" />
          <Column dataField="action" caption="Result" width={100} cellRender={renderAction} />
          <Column caption="Details" minWidth={240} cellRender={renderDetails} allowSorting={false} />
        </DataGrid>
      </div>
    </>
  );

  return (
    <Popup
      ref={popup}
      visible={visible}
      onHiding={close}
      title="Import items from Excel"
      width={1000}
      maxWidth="96vw"
      // Sized to its content until a sheet is read; then tall, for the review grid.
      height={preview ? "88vh" : "auto"}
      maxHeight="92vh"
      showCloseButton={true}
      dragEnabled={false}
      hideOnOutsideClick={false}
      wrapperAttr={{ class: "items-popup import-popup" }}
      contentRender={() => (
        <div className="import-body">
          {steps}

          {error && (
            <div className="import-error" role="alert">
              <Icon name="alert" size={17} />
              <span>{error}</span>
            </div>
          )}

          {preview ? review : start}

          <div className="import-footer">
            <span className="import-summary">
              {preview &&
                (toImport > 0 ? (
                  <>
                    <b>{n(preview.add)}</b> new and <b>{n(preview.update)}</b> updated will be saved
                    {preview.errors ? (
                      <>
                        {" "}
                        · <span className="import-summary-error">{n(preview.errors)} with errors skipped</span>
                      </>
                    ) : null}
                  </>
                ) : preview.errors ? (
                  "Nothing to import - fix the errors in the sheet and upload it again."
                ) : (
                  "Nothing to import - every row already matches your catalog."
                ))}
            </span>
            <button type="button" className="page-btn page-btn-muted" onClick={close}>
              Cancel
            </button>
            <button type="button" className="page-btn page-btn-primary" disabled={!toImport || !!busy} onClick={runImport}>
              <Icon name="check" size={17} strokeWidth={2.2} />
              {toImport ? `Import ${n(toImport)} item${toImport === 1 ? "" : "s"}` : "Import"}
            </button>
          </div>

          <LoadPanel visible={!!busy} message={busy || ""} showPane={true} shading={false} position={{ of: ".import-body" }} />
        </div>
      )}
    />
  );
}
