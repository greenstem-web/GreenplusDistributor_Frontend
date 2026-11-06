import client from "./baseapi";

/**
 * Every catalog item at every linked company - or one company with companyId - with its
 * visibility there and, for companies that share their data, the copied stock quantity.
 */
export async function getCompanyItems(companyId = null) {
  const { data } = await client.get("/api/company-items", {
    params: companyId ? { companyId } : {},
  });
  return data || [];
}
