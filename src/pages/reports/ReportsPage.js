import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateBox from "devextreme-react/date-box";
import CheckBox from "devextreme-react/check-box";
import SelectBox from "devextreme-react/select-box";
import LoadIndicator from "devextreme-react/load-indicator";
import notify from "devextreme/ui/notify";
import {
  MAX_TREND_MONTHS,
  REPORTS,
  getReportFile,
  monthsIn,
  reportFileName,
  reportParams,
} from "../../api/reports";
import * as catalogApi from "../../api/catalog";
import { describeError } from "../../api/baseapi";
import Icon from "../../components/Icon";
import "./reports.css";

/** Quick periods. Each returns [from, to], both days inclusive. */
const PERIODS = [
  {
    key: "this-month",
    label: "This month",
    range: (today) => [new Date(today.getFullYear(), today.getMonth(), 1), today],
  },
  {
    key: "last-month",
    label: "Last month",
    range: (today) => [
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
      new Date(today.getFullYear(), today.getMonth(), 0),
    ],
  },
  {
    key: "last-3-months",
    label: "Last 3 months",
    range: (today) => [new Date(today.getFullYear(), today.getMonth() - 2, 1), today],
  },
  {
    key: "this-year",
    label: "This year",
    range: (today) => [new Date(today.getFullYear(), 0, 1), today],
  },
  {
    key: "last-12-months",
    label: "Last 12 months",
    range: (today) => [new Date(today.getFullYear(), today.getMonth() - 11, 1), today],
  },
];

/** A two-way choice shown as a segmented control. */
function Segmented({ label, value, options, onChange }) {
  return (
    <div className="reports-option">
      <span className="reports-option-label">{label}</span>
      <div className="reports-segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={"reports-segment" + (value === o.value ? " reports-segment-on" : "")}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A section's heading: its icon on a tinted tile, then the words. */
function Heading({ icon, tone, children }) {
  return (
    <h2 className="reports-heading">
      <span className={`reports-heading-icon app-tone-${tone}`} aria-hidden="true">
        <Icon name={icon} size={17} />
      </span>
      {children}
    </h2>
  );
}

/** dd/MM/yyyy, as the reports print it. */
function formatDay(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function todayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

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

/**
 * Printable reports. The API renders each one with the DevExpress report engine and returns a
 * finished PDF (shown in the preview, where the browser's viewer pages, zooms and prints it) or an
 * Excel file (downloaded). Sales figures come from the same copy as the home page.
 */
export default function ReportsPage() {
  const [reportKey, setReportKey] = useState(REPORTS[0].key);
  const [periodKey, setPeriodKey] = useState("this-month");
  const [from, setFrom] = useState(() => PERIODS[0].range(todayDate())[0]);
  const [to, setTo] = useState(() => PERIODS[0].range(todayDate())[1]);
  const [by, setBy] = useState("item");
  const [measure, setMeasure] = useState("amount");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFor, setPreviewFor] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(null); // "pdf" | "xlsx" | null
  const [error, setError] = useState(null);
  const previewUrlRef = useRef(null);
  // Numbers each preview request, so a slow older one cannot replace a newer one's preview.
  const previewRequest = useRef(0);

  const report = REPORTS.find((r) => r.key === reportKey) || REPORTS[0];

  // What stops a report being run, as a sentence - or null when it can run.
  const problem = useMemo(() => {
    if (!report.period) return null;
    if (!from || !to || from > to) return "Choose a start date on or before the end date.";
    if (report.key === "monthly-trend" && monthsIn(from, to) > MAX_TREND_MONTHS)
      return `The monthly trend covers at most ${MAX_TREND_MONTHS} months - shorten the period.`;
    return null;
  }, [report, from, to]);

  // The company picker for Visibility by Company. Loaded once; the report is fine without it.
  useEffect(() => {
    catalogApi
      .getCompanies()
      .then((list) => setCompanies(list || []))
      .catch(() => setCompanies([]));
  }, []);

  // The preview's object URL is released when replaced and when the page closes.
  const showPreview = useCallback((url, label) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPreviewFor(label);
  }, []);

  useEffect(() => () => previewUrlRef.current && URL.revokeObjectURL(previewUrlRef.current), []);

  const choosePeriod = (period) => {
    const [f, t] = period.range(todayDate());
    setPeriodKey(period.key);
    setFrom(f);
    setTo(t);
  };

  const previewLabel = () => {
    if (report.period) return `${report.title} · ${formatDay(from)} - ${formatDay(to)}`;
    if (report.key === "visibility" && companyId) {
      const company = companies.find((c) => c.companyId === companyId);
      return `${report.title} · ${company?.companyName ?? ""}`;
    }
    return report.title;
  };

  const run = async (format) => {
    if (problem) return;
    const isPreview = format === "pdf-preview";
    const requestNo = isPreview ? ++previewRequest.current : 0;
    const stale = () => isPreview && requestNo !== previewRequest.current;

    if (isPreview) {
      setPreviewLoading(true);
      setError(null);
    } else {
      setDownloading(format);
    }

    const params = reportParams(report, { from, to, by, measure, includeInactive, companyId });

    try {
      const fileFormat = format === "xlsx" ? "xlsx" : "pdf";
      const blob = await getReportFile(report, params, fileFormat);

      if (isPreview) {
        if (stale()) return;
        const pdf = new Blob([blob], { type: "application/pdf" });
        showPreview(URL.createObjectURL(pdf), previewLabel());
      } else {
        saveBlob(blob, reportFileName(report, params, fileFormat));
      }
    } catch (e) {
      const message = describeError(e, "Could not produce the report.").message;
      if (isPreview) {
        if (!stale()) setError(message);
      } else {
        notify({ message, type: "error", displayTime: 6000 }, "error", 6000);
      }
    } finally {
      if (!isPreview) setDownloading(null);
      else if (!stale()) setPreviewLoading(false);
    }
  };

  // The preview follows the choices: pick a report, a period or an option and it redraws, so what
  // is on screen is always what the download buttons would save.
  useEffect(() => {
    if (problem) {
      setError(null);
      return;
    }
    run("pdf-preview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, from, to, by, measure, includeInactive, companyId, problem]);

  const companyChoices = useMemo(
    () => [{ companyId: null, companyName: "All companies" }, ...companies],
    [companies]
  );

  return (
    <div className="reports-page">
      <aside className="reports-side">
        {/* The report list scrolls on its own; the choices for the selected report and the
            download buttons below it stay in view however long the list grows. */}
        <section className="reports-section reports-section-list">
          <Heading icon="document" tone="purple">
            Reports
          </Heading>
          <div className="reports-list" role="radiogroup" aria-label="Report">
            {REPORTS.map((r) => (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={r.key === reportKey}
                className={"reports-item" + (r.key === reportKey ? " reports-item-on" : "")}
                onClick={() => setReportKey(r.key)}
              >
                <span className="reports-item-title">{r.title}</span>
                <span className="reports-item-desc">{r.description}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="reports-params">
        {report.period && (
          <section className="reports-section">
            <Heading icon="calendar" tone="blue">
              Period
            </Heading>
            <div className="reports-periods">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={"reports-period" + (p.key === periodKey ? " reports-period-on" : "")}
                  onClick={() => choosePeriod(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="reports-dates">
              <label className="reports-date">
                <span>From</span>
                <DateBox
                  type="date"
                  displayFormat="dd/MM/yyyy"
                  useMaskBehavior={true}
                  value={from}
                  max={to || undefined}
                  onValueChanged={(e) => {
                    if (!e.event) return;
                    setFrom(e.value);
                    setPeriodKey(null);
                  }}
                />
              </label>
              <label className="reports-date">
                <span>To</span>
                <DateBox
                  type="date"
                  displayFormat="dd/MM/yyyy"
                  useMaskBehavior={true}
                  value={to}
                  min={from || undefined}
                  onValueChanged={(e) => {
                    if (!e.event) return;
                    setTo(e.value);
                    setPeriodKey(null);
                  }}
                />
              </label>
            </div>
          </section>
        )}

        {report.options.length > 0 && (
          <section className="reports-section">
            <Heading icon="sliders" tone="teal">
              Options
            </Heading>
            {report.options.includes("by") && (
              <Segmented
                label="Rows"
                value={by}
                onChange={setBy}
                options={[
                  { value: "item", label: "Items" },
                  { value: "company", label: "Companies" },
                ]}
              />
            )}
            {report.options.includes("measure") && (
              <Segmented
                label="Show"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: "amount", label: "Amount" },
                  { value: "quantity", label: "Quantity" },
                ]}
              />
            )}
            {report.options.includes("includeInactive") && (
              <CheckBox
                text="Include inactive items"
                value={includeInactive}
                onValueChanged={(e) => {
                  if (!e.event) return;
                  setIncludeInactive(e.value);
                }}
              />
            )}
            {report.options.includes("company") && (
              <div className="reports-option">
                <span className="reports-option-label">Company</span>
                <SelectBox
                  dataSource={companyChoices}
                  valueExpr="companyId"
                  displayExpr="companyName"
                  value={companyId}
                  searchEnabled={companies.length > 8}
                  onSelectionChanged={(e) => {
                    // Lookups report a user pick through onSelectionChanged, not onValueChanged.
                    if (e.selectedItem) setCompanyId(e.selectedItem.companyId);
                  }}
                />
              </div>
            )}
          </section>
        )}

        {problem && <div className="reports-invalid">{problem}</div>}

        <section className="reports-section reports-actions">
          <button
            type="button"
            className="page-btn page-btn-primary"
            disabled={!!problem || downloading !== null}
            onClick={() => run("pdf")}
          >
            <Icon name="document" size={17} />
            {downloading === "pdf" ? "Preparing..." : "Download PDF"}
          </button>
          <button type="button" className="page-btn" disabled={!!problem || downloading !== null} onClick={() => run("xlsx")}>
            <Icon name="download" size={17} />
            {downloading === "xlsx" ? "Preparing..." : "Download Excel"}
          </button>
        </section>

        <p className="reports-note">
          {report.period
            ? "Sales figures cover companies that share their sales data with you, and are as fresh as the last sync (every 15 minutes)."
            : "Shows your catalog as it stands right now."}
        </p>
        </div>
      </aside>

      <main className="reports-preview">
        <div className="reports-preview-bar">
          <span className="reports-preview-title">{previewFor || "Preview"}</span>
        </div>
        <div className="reports-preview-body" aria-busy={previewLoading}>
          {/* Over the previous preview (or the empty panel) until the new one arrives, so the old
              pages are never mistaken for the report just asked for. */}
          {previewLoading && !problem && (
            <div className="reports-loading" role="status">
              <LoadIndicator width={36} height={36} />
              <span className="reports-loading-text">Preparing {report.title}...</span>
            </div>
          )}
          {error ? (
            <div className="reports-message reports-message-error">{error}</div>
          ) : problem ? (
            <div className="reports-message">{problem}</div>
          ) : previewUrl ? (
            <iframe className="reports-frame" title="Report preview" src={previewUrl} />
          ) : (
            !previewLoading && <div className="reports-message">Choose a report.</div>
          )}
        </div>
      </main>
    </div>
  );
}
