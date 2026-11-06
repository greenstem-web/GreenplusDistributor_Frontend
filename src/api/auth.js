import client, { setToken } from "./baseapi";

/**
 * Signs in. `resubmit` is the answer to the duplicate-login prompt: when the account is signed in on
 * another device the API refuses with 409 { code: "duplicate_login" }, and posting again with
 * resubmit = true ends that session - as in the accounting app.
 */
export async function login(username, password, resubmit = false) {
  const { data } = await client.post("/api/auth/login", { username, password, resubmit });
  setToken(data.accessToken);
  return data;
}

/**
 * Re-establishes context after a page refresh. The token survives in localStorage but says nothing
 * about whether the account is still active, so this is what decides between "still signed in" and
 * "show the login screen" - the server does, not the presence of a token.
 */
export async function getCurrentUser() {
  const { data } = await client.get("/api/auth/me");
  return data;
}

/**
 * Signs out: ends the session on the server too, so the next login is not asked about a duplicate
 * session and this token stops working at once. Best effort - the local sign-out happens either way.
 */
export async function logout() {
  try {
    await client.post("/api/auth/logout");
  } catch {
    // Already ended (replaced, expired) or the API is down - nothing more to do here.
  }
  setToken(null);
}

/** Forgets this browser's token WITHOUT telling the server - for a session the server already ended. */
export function dropSession() {
  setToken(null);
}

/**
 * Changes the signed-in user's own password. The current one is required; a wrong one counts
 * towards the sign-in lockout. The session stays signed in.
 */
export async function changePassword(currentPassword, newPassword) {
  await client.post("/api/auth/change-password", { currentPassword, newPassword });
}

/**
 * "Forgot password?" - a username or an email address. The API answers the same whether or not it
 * matched anything, so this returns its message rather than a yes or no.
 */
export async function forgotPassword(login) {
  const { data } = await client.post("/api/auth/forgot-password", { login });
  return data?.message || "";
}

/** Who an emailed set-password link is for. Rejects with 404 when it has expired or been used. */
export async function getSetPasswordLink(token) {
  const { data } = await client.get("/api/auth/set-password", { params: { token } });
  return data;
}

/** Uses an emailed set-password link. The user then signs in with the new password. */
export async function setPassword(token, newPassword) {
  await client.post("/api/auth/set-password", { token, newPassword });
}
