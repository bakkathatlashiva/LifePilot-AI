import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export function normalizeApiUrl(url?: string): string {
  // In development, prefer relative '/api' so Vite proxy forwards to backend without CORS or IP mismatches
  if (!url || url === '/api' || url.includes('10.10.6.137')) {
    return '/api';
  }

  const clean = url.trim().replace(/\/+$/, '');
  if (!clean || clean === '/api') return '/api';
  if (clean.endsWith('/api')) return clean;
  return `${clean}/api`;
}

export const API_BASE_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);
const BASE_URL = API_BASE_URL;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT ─────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: auto-refresh on 401 ───────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
}

function handleAuthFailure(error: unknown) {
  processQueue(error, null);
  isRefreshing = false;

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');

  // Purge Zustand persisted storage so stale state doesn't resurrect on navigation
  try {
    const raw = localStorage.getItem('lifepilot-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state) {
        parsed.state.accessToken = null;
        parsed.state.refreshToken = null;
        parsed.state.isAuthenticated = false;
        parsed.state.user = null;
        localStorage.setItem('lifepilot-auth', JSON.stringify(parsed));
      }
    }
  } catch {}

  // Broadcast event so active React state resets without hard page reload
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('lifepilot:unauthorized'));

    // Only redirect if not already on the login or public auth routes
    const pathname = window.location.pathname;
    if (!pathname.startsWith('/login') && !pathname.startsWith('/auth/')) {
      window.location.replace('/login');
    }
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = originalRequest?.url || '';

    // Bypass 401 interceptor for auth endpoints to prevent loops
    if (
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/auth/google') ||
      url.includes('/auth/exchange-code')
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        handleAuthFailure(error);
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const newToken = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        isRefreshing = false;
        return api(originalRequest);
      } catch (refreshError) {
        handleAuthFailure(refreshError);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
