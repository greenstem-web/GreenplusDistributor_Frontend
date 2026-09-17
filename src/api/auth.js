import client, { setToken } from "./baseapi";

export async function login(username, password) {
  const { data } = await client.post("/api/auth/login", { username, password });
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

export function logout() {
  setToken(null);
}
