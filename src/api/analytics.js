import client from "./baseapi";

/** yyyy-MM-dd in LOCAL time - toISOString() would shift the day for anyone east of UTC. */
export function toApiDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The API sends dates as "2026-09-25T00:00:00" with no zone. new Date() on that string is fine,
 * but on a bare "2026-09-25" it would be UTC midnight - the previous evening here. Reading the
 * parts directly avoids both traps.
 */
export function fromApiDate(value) {
  if (!value) return null;
  // Already a Date (a DataGrid column with dataType "date" hands its cells one).
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const [datePart, timePart = "00:00:00"] = String(value).split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map((x) => parseInt(x, 10) || 0);
  return new Date(y, m - 1, d, hh, mm, ss);
}

/**
 * Headline figures, trend and rankings for [from, to], both days inclusive. Figures cover only
 * companies whose consent is active, and are as fresh as the movement job's last run.
 */
/**
 * When the figures last changed - a tiny read the home page polls, so it reloads the overview only
 * when the movement job has actually written something new.
 */
export async function getLastChanged() {
  const { data } = await client.get("/api/analytics/last-changed");
  return data?.lastChanged ?? null;
}

export async function getOverview(from, to) {
  const { data } = await client.get("/api/analytics/overview", {
    params: { from: toApiDate(from), to: toApiDate(to) },
  });
  return data;
}

/**
 * One linked company for [from, to]: its sales of your items (with the previous period and a trend,
 * as the overview) and every catalog item there - visibility, stock, sales. 404 when the company is
 * not linked to you.
 */
export async function getCompanyDetail(companyId, from, to) {
  const { data } = await client.get(`/api/analytics/companies/${encodeURIComponent(companyId)}`, {
    params: { from: toApiDate(from), to: toApiDate(to) },
  });
  return data;
}

/**
 * One catalog item for [from, to]: its sales (with the previous period and a trend) and every linked
 * company - visibility, stock, sales. 404 when the item is not yours.
 */
export async function getItemDetail(distributorStockId, from, to) {
  const { data } = await client.get(`/api/analytics/items/${encodeURIComponent(distributorStockId)}`, {
    params: { from: toApiDate(from), to: toApiDate(to) },
  });
  return data;
}
