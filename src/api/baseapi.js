import axios from "axios";

const TOKEN_KEY = "distributor.token";

export const apiurl = process.env.REACT_APP_API_URL || "http://localhost:5104";

/**
 * The single place the Authorization header is set.
 *
 * Deliberately an interceptor rather than a header passed at each call site: when the platform moves
 * from a bearer token to anything else, this file changes and nothing else does. The accounting
 * frontend's baseapi grew to ~400 lines partly because token handling ended up spread across params,
 * URLs and headers, and every retry path had to know about all three.
 *
 * No refresh flow, because the API has no refresh endpoint - tokens are valid until they expire
 * (8 hours by default), or until the account signs in elsewhere; either way the response
 * interceptor below signs this tab out. If refresh is added, it belongs here.
 */
const client = axios.create({ baseURL: apiurl });

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * ONE SESSION PER ACCOUNT. When this account signs in on another device, the API refuses this
 * browser's token: 409 { code: "duplicate_login" } (the accounting app's status), or 401 once the
 * session has ended (signed out, account disabled, token expired). Every call can hit that, so it is
 * caught here once and handed to the auth context, which tells the user and signs this tab out.
 *
 * The login call itself is excluded: its 409 is the "already signed in elsewhere - continue?"
 * question, which the login page answers.
 */
let onSessionLost = null;

export function setSessionLostHandler(handler) {
  onSessionLost = handler;
}

client.interceptors.response.use(undefined, (error) => {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  const isLogin = String(error?.config?.url || "").includes("/api/auth/login");

  if (!isLogin && getToken() && onSessionLost) {
    if (status === 409 && code === "duplicate_login") onSessionLost("duplicate");
    else if (status === 401) onSessionLost("ended");
  }
  return Promise.reject(error);
});

/**
 * Turns an axios error into something a screen can render.
 *
 * The API answers with { error } on failures and adds retryAfterSeconds on a 423, so the message a
 * user sees comes from the server rather than being guessed from the status code. Only the fallback
 * is invented here.
 */
export function describeError(error, fallback = "Something went wrong. Please try again.") {
  const status = error?.response?.status;
  const data = error?.response?.data;

  if (!error?.response) {
    return {
      status: 0,
      message:
        "Could not reach the API. Check that Greenplus.Distributor.Api is running on " +
        `${apiurl} and that this origin is in its Cors:AllowedOrigins.`,
    };
  }

  return {
    status,
    message: data?.error || fallback,
    retryAfterSeconds: data?.retryAfterSeconds,
  };
}

/** True when the session is gone rather than the request being wrong. */
export function isUnauthorized(error) {
  return error?.response?.status === 401;
}

export default client;
