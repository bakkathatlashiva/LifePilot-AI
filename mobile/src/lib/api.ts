import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const getHostIp = (): string => {
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return ip;
    }
  }
  return '192.168.0.7';
};

export const normalizeApiUrl = (url?: string): string => {
  const hostIp = getHostIp();
  // Default to the host computer's backend on port 3001
  const defaultUrl = `http://${hostIp}:3001/api`;
  let clean = url?.trim() || defaultUrl;

  // On physical Android/iOS devices, replace localhost / 127.0.0.1 with host computer IP
  if (Platform.OS !== 'web' && (clean.includes('localhost') || clean.includes('127.0.0.1'))) {
    clean = clean.replace(/localhost|127\.0\.0\.1/, hostIp);
  }

  clean = clean.replace(/\/+$/, '');
  if (!clean.endsWith('/api')) {
    clean = `${clean}/api`;
  }
  return clean;
};

// Update this to your deployed backend URL for production builds
export const API_BASE_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
const BASE_URL = API_BASE_URL;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  config.headers['ngrok-skip-browser-warning'] = 'true';
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (refreshToken) {
          try {
            const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
            const newToken = data.data.accessToken;
            await SecureStore.setItemAsync('accessToken', newToken);
            original.headers.Authorization = `Bearer ${newToken}`;
            isRefreshing = false;
            return api(original);
          } catch {
            await SecureStore.deleteItemAsync('accessToken');
            await SecureStore.deleteItemAsync('refreshToken');
          }
        }
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
