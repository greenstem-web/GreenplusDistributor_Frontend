import client from "./baseapi";

/**
 * Companies' stock of your items - one company's with companyId, all of them without. Copied from
 * each consenting company by the movement job, so as fresh as its last run (every 15 minutes).
 */
export async function getStockLevels(companyId = null) {
  const { data } = await client.get("/api/stock-levels", {
    params: companyId ? { companyId } : {},
  });
  return data || [];
}

/** Items at or below their warning quantity, out of stock first - the home page panel. */
export async function getStockWarnings() {
  const { data } = await client.get("/api/stock-levels/warnings");
  return data;
}
