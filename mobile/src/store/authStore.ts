import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initialize: () => Promise<void>;
  setTokens: (access: string, refresh: string) => Promise<void>;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });
    try {
      // Race SecureStore query with a 2-second timeout so app never hangs indefinitely
      const token = await Promise.race([
        SecureStore.getItemAsync('accessToken'),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      if (token) {
        // Race profile fetch with a 3.5-second timeout
        await Promise.race([
          get().loadProfile(),
          new Promise<void>((resolve) => setTimeout(() => resolve(), 3500)),
        ]);
      }
    } catch {
      set({ isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  setTokens: async (access, refresh) => {
    await SecureStore.setItemAsync('accessToken', access);
    await SecureStore.setItemAsync('refreshToken', refresh);
    set({ isAuthenticated: true });
  },

  loadProfile: async () => {
    try {
      const { data } = await api.get('/auth/profile');
      set({ user: data.data, isAuthenticated: true });
    } catch {
      set({ isAuthenticated: false, user: null });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ user: null, isAuthenticated: false });
  },
}));
