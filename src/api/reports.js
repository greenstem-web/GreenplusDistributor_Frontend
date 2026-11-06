import client from "./baseapi";
import { toApiDate } from "./analytics";

/** At most this many months on the Monthly Trend - one column each (matches the API). */
export const MAX_TREND_MONTHS = 12;

/**
 * The reports the API can render. `path` is under /api/reports.
 *   period    the report takes a from/to range
 *   options   which extra choices the page shows for it
 */
export const REPORTS = [
  {
    key: "sales-by-item",
    path: "sales-by-item",
    title: "Sales by Item",
    description: "Every item sold in the period, best seller first, with quantity, amount and share of sales.",
    period: true,
    options: [],
  },
  {
    key: "sales-by-company",
    path: "sales-by-company",
    title: "Sales by Company",
    description: "Each company that bought in the period, highest amount first, with the items it bought.",
    period: true,
    options: [],
  },
  {
    key: "sales-by-area",
    path: "sales-by-area",
    title: "Sales by Area",
    description: "Sales grouped by where each company is (its State), with the companies in each area and their city.",
    period: true,
    options: [],
  },
  {
    key: "monthly-trend",
    path: "monthly-trend",
    title: "Monthly Trend",
    description: "Month by month for each item or company, compared with the period before. Up to 12 months.",
    period: true,
    options: ["by", "measure"],
  },
  {
    key: "catalog",
    path: "catalog",
    title: "Catalog / Price List",
    description: "Your catalog as it stands: UOM, barcode, cost, price, margin and default visibility.",
    period: false,
    options: ["includeInactive"],
  },
  {
    key: "visibility",
    path: "visibility",
    title: "Visibility by Company",
    description: "What each linked company can see of your catalog, and which settings are custom.",
    period: false,
    options: ["company"],
  },
];

/** How many calendar months [from, to] touches. */
export function monthsIn(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
}

/** The query parameters for one report, from the page's choices. */
export function reportParams(report, { from, to, by, measure, includeInactive, companyId }) {
  const params = {};
  if (report.period) {
    params.from = toApiDate(from);
    params.to = toApiDate(to);
  }
  if (report.options.includes("by")) params.by = by;
  if (report.options.includes("measure")) params.measure = measure;
  if (report.options.includes("includeInactive")) params.includeInactive = !!includeInactive;
  if (report.options.includes("company") && companyId) params.companyId = companyId;
  return params;
}

/**
 * A finished report as a Blob - PDF or Excel, rendered on the server. Fetched through the shared
 * client so it carries the bearer token like every other call; a plain link or iframe src would not.
 */
export async function getReportFile(report, params, format = "pdf") {
  try {
    const { data } = await client.get(`/api/reports/${report.path}`, {
      params: { ...params, format },
      responseType: "blob",
    });
    return data;
  } catch (error) {
    // With responseType blob, the API's { error } arrives as a Blob too. Read it back into JSON so
    // describeError can show the server's message instead of a generic one.
    const body = error?.response?.data;
    if (body instanceof Blob) {
      try {
        error.response.data = JSON.parse(await body.text());
      } catch {
        // Not JSON - leave it; describeError falls back to its own message.
      }
    }
    throw error;
  }
}

/**
 * The file a download is saved under: "Sales by Item 20260901-20260930.pdf" for a period report,
 * "Catalog Price List 20260929.pdf" (today) for the others.
 */
export function reportFileName(report, params, format) {
  const compact = (value) => String(value).replace(/-/g, "");
  const title = report.title.replace(/\s*\/\s*/g, " ");
  const stamp = report.period
    ? `${compact(params.from)}-${compact(params.to)}`
    : compact(toApiDate(new Date()));
  return `${title} ${stamp}.${format}`;
}
