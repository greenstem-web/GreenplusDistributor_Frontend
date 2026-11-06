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

/**
 * The predefined UOM list - the Items screen's drop-down. Maintained by Greenplus, the same for
 * every distributor, so one unit cannot end up under several codes. Read-only here.
 */
export async function getUoms() {
  const { data } = await client.get("/api/catalog/uoms");
  return data || [];
}

/* ------------------------------------------------------------------ Excel import
 *
 * Three steps, as on the Import screen: download the template (or your catalog, to edit and upload
 * back), preview an upload - which saves nothing - then import the previewed rows. The API checks
 * the rows again on import.
 */

/** The .xlsx to fill in, as a Blob. `withItems` puts your current catalog in it. */
export async function getImportTemplate(withItems = false) {
  try {
    const { data } = await client.get("/api/catalog/import/template", { params: { withItems }, responseType: "blob" });
    return data;
  } catch (error) {
    // With responseType blob the API's { error } arrives as a Blob - read it back for describeError.
    const body = error?.response?.data;
    if (body instanceof Blob) {
      try {
        error.response.data = JSON.parse(await body.text());
      } catch {
        // Not JSON - describeError falls back to its own message.
      }
    }
    throw error;
  }
}

/**
 * What importing this file would do, row by row: { rows: [{ row, action, errors, changes }], add,
 * update, unchanged, skip, errors }. Nothing is saved.
 */
export async function previewImport(file, updateExisting) {
  const form = new FormData();
  form.append("file", file);
  form.append("updateExisting", updateExisting ? "true" : "false");
  const { data } = await client.post("/api/catalog/import/preview", form);
  return data;
}

/** Imports previewed rows (the `row` of each). Rows with errors are skipped; the rest save together. */
export async function importItems(rows, updateExisting, fileName) {
  const { data } = await client.post("/api/catalog/import", { rows, updateExisting, fileName });
  return data;
}
