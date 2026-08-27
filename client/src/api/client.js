import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20000,
});

export const GEO_TIMEOUT_MS = 60000;

let accessToken = null;
let onAuthLost = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setAuthLostHandler(handler) {
  onAuthLost = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

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

    if (status === 401 && ['SESSION_REVOKED', 'PASSWORD_CHANGED', 'USER_GONE'].includes(code)) {
      setAccessToken(null);
      if (onAuthLost) onAuthLost();
    }

    return Promise.reject(normaliseError(error));
  }
);

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
