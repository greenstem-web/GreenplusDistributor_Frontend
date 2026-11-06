import client from "./baseapi";

/**
 * Managing this distributor's logins - admins only; the API answers 403 to anyone else, checking
 * the admin flag in the database on every call.
 *
 * Nobody types a password for someone else: a new login is emailed an invitation to set its own,
 * and a forgotten password is replaced the same way. Both answer
 * { user, emailSent, emailError, link } - `link` only when the email could not be sent, for the
 * admin to pass on instead.
 */

export async function getUsers() {
  const { data } = await client.get("/api/users");
  return data || [];
}

/** Adds a login (email required) and emails it an invitation. */
export async function createUser(user) {
  const { data } = await client.post("/api/users", user);
  return data;
}

/** Username, email, phone, admin and active - never the password. */
export async function updateUser(userId, user) {
  const { data } = await client.put(`/api/users/${userId}`, user);
  return data;
}

/** Emails a new set-password link: the invitation again, or a reset for a forgotten password. */
export async function sendSetPasswordLink(userId) {
  const { data } = await client.post(`/api/users/${userId}/send-link`);
  return data;
}

/** Clears a lock from too many wrong passwords. */
export async function unlockUser(userId) {
  const { data } = await client.post(`/api/users/${userId}/unlock`);
  return data;
}
