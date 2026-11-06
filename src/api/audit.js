import client from "./baseapi";
import { toApiDate } from "./analytics";

/**
 * One page of the audit log for [from, to] (both days inclusive), newest first: `take` rows starting
 * `skip` rows in (the API allows 1-200), with `total` saying how many matched. Filters are optional:
 * userId, category ("catalog" / "visibility" / "session" / "users") and a search over the summary,
 * username and changed values.
 */
export async function getAuditLog({ from, to, userId, category, search, skip = 0, take = 50 }) {
  const { data } = await client.get("/api/audit", {
    params: {
      from: toApiDate(from),
      to: toApiDate(to),
      userId: userId || undefined,
      category: category || undefined,
      search: search || undefined,
      skip,
      take,
    },
  });
  return data || { items: [], total: 0 };
}

/** This distributor's logins, for the "who" filter. */
export async function getAuditUsers() {
  const { data } = await client.get("/api/audit/users");
  return data || [];
}
