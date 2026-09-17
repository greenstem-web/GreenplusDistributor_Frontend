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
 * (8 hours by default) and a 401 means log in again. If refresh is added, it belongs here.
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
