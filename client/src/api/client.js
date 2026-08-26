import axios from 'axios';

/**
 * One axios instance for the whole app.
 *
 * The access token lives in memory only - never localStorage - so a script
 * injected into the page cannot read it. The refresh token is an httpOnly
 * cookie the browser sends automatically, which is why `withCredentials` is on.
 * Surviving a page refresh works by calling /auth/refresh on boot.
 */

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20000,
});

/**
 * Longer allowance for the calls that go out to OpenStreetMap.
 *
 * Overpass and Nominatim are donated infrastructure: a query covering a city
 * routinely takes fifteen seconds and the server races several mirrors before
 * it answers. At the shared 20 s the browser gave up at almost exactly the
 * moment the server was about to reply, so a lookup that was working fine
 * surfaced as a timeout. Everything else keeps the shorter limit, because a
 * twenty-second wait on the contact list really is worth reporting.
 */
export const GEO_TIMEOUT_MS = 60000;

let accessToken = null;
let onAuthLost = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Called when refreshing fails, so the auth context can clear its state. */
export function setAuthLostHandler(handler) {
  onAuthLost = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/*
 * When a request 401s because the access token aged out, refresh once and
 * replay it. `refreshPromise` means ten parallel requests hitting an expired
 * token cause one refresh, not ten - otherwise they race and most of them get
 * a token that has already been rotated away.
 */
let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', {}, { _skipAuthRetry: true })
      .then((response) => {
        const token = response.data?.data?.accessToken;
        setAccessToken(token || null);
        return response.data?.data || null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const isExpiredToken =
      status === 401 && ['TOKEN_EXPIRED', 'NO_TOKEN'].includes(code) && accessToken;

    if (isExpiredToken && !original._retried && !original._skipAuthRetry) {
      original._retried = true;
      try {
        await refreshAccessToken();
        return await api(original);
      } catch {
        setAccessToken(null);
        if (onAuthLost) onAuthLost();
      }
    }

    // The session is genuinely gone - not just an expired access token.
    if (status === 401 && ['SESSION_REVOKED', 'PASSWORD_CHANGED', 'USER_GONE'].includes(code)) {
      setAccessToken(null);
      if (onAuthLost) onAuthLost();
    }

    return Promise.reject(normaliseError(error));
  }
);

/**
 * Turns every failure into the same shape, so components never have to reach
 * into `error.response.data` or guess whether `message` exists.
 *
 * @returns {{message:string, code:string, status:number, details:object, isNetworkError:boolean}}
 */
export function normaliseError(error) {
  if (error.response) {
    const data = error.response.data || {};
    return {
      message: data.message || 'Something went wrong. Please try again.',
      code: data.code || 'ERROR',
      status: error.response.status,
      details: data.details || {},
      isNetworkError: false,
    };
  }

  if (error.code === 'ECONNABORTED') {
    return {
      // Not the reader's connection, usually - the map services this depends on
      // are donated infrastructure and go slow without warning. Blaming their
      // wifi sent people off to fix something that was never broken.
      message: 'Still waiting on a response. Please try again.',
      code: 'TIMEOUT',
      status: 0,
      details: {},
      isNetworkError: true,
    };
  }

  return {
    message: 'We could not reach the server. Check your internet connection.',
    code: 'NETWORK_ERROR',
    status: 0,
    details: {},
    isNetworkError: true,
  };
}

export { refreshAccessToken };
export default api;
