import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

const refreshApi = axios.create({
  baseURL,
  withCredentials: true,
});

let storeRef;

export const injectStore = (_store) => {
  storeRef = _store;
};

api.interceptors.request.use((config) => {
  const state = storeRef?.getState();
  const token = state?.auth?.accessToken;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let isRefreshing = false;
let pendingRequests = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = token ? `Bearer ${token}` : undefined;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await refreshApi.post('/auth/refresh');
        const token = res.data?.accessToken;

        if (token && storeRef) {
          storeRef.dispatch({ type: 'auth/tokenRefreshed', payload: { accessToken: token } });
        }

        pendingRequests.forEach(({ resolve }) => resolve(token));
        pendingRequests = [];
        isRefreshing = false;

        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
        }

        return api(original);
      } catch (err) {
        pendingRequests.forEach(({ reject }) => reject(err));
        pendingRequests = [];
        isRefreshing = false;

        if (storeRef) {
          storeRef.dispatch({ type: 'auth/clearSession' });
        }

        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);