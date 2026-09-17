import client from "./baseapi";

export async function getCompanies() {
  const { data } = await client.get("/api/catalog/companies");
  return data;
}

export async function getCatalog() {
  const { data } = await client.get("/api/catalog");
  return data;
}

export async function getCatalogForCompany(companyId) {
  const { data } = await client.get(`/api/catalog/company/${companyId}`);
  return data;
}

/**
 * Returns { distributorStockId, visible, isOverride, action } where action is
 * created | updated | removed | unchanged.
 *
 * Setting visibility back to the item's default REMOVES the override rather than saving one, so the
 * response - not the switch position - is what the grid should believe afterwards.
 */
export async function setVisibility(companyId, distributorStockId, visible) {
  const { data } = await client.put(`/api/catalog/company/${companyId}/visibility`, {
    distributorStockId,
    visible,
  });
  return data;
}
