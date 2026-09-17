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

/* ------------------------------------------------------------------ managing your own catalog
 *
 * These return the fuller shape - description, active, audit dates - and never mention a company.
 * The company-scoped calls above answer "what may this company use"; these answer "what have I
 * published", which is the same for everyone.
 */

/** Every item you publish. Pass true to include the ones switched off. */
export async function getItems(includeInactive = false) {
  const { data } = await client.get("/api/catalog/items", { params: { includeInactive } });
  return data;
}

export async function getItem(distributorStockId) {
  const { data } = await client.get(`/api/catalog/items/${distributorStockId}`);
  return data;
}

/**
 * Both of these return the SAVED row, which is not always what was sent: the code comes back
 * trimmed and upper-cased, and blank optional fields come back null. Render the response, not the
 * form values, or the grid disagrees with the database until the next reload.
 */
export async function createItem(values) {
  const { data } = await client.post("/api/catalog/items", values);
  return data;
}

/**
 * A full replace, not a patch - every field is written from what you send. Send the whole item,
 * never only the fields that changed, or the omitted ones are cleared.
 */
export async function updateItem(distributorStockId, values) {
  const { data } = await client.put(`/api/catalog/items/${distributorStockId}`, values);
  return data;
}

/** Withdraws the item. A soft delete server-side: companies that adopted it keep their history. */
export async function deleteItem(distributorStockId) {
  await client.delete(`/api/catalog/items/${distributorStockId}`);
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
