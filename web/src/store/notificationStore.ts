import { create } from 'zustand';
import { Notification } from '../types';
import api from '../lib/api';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  registerWebPush: () => Promise<void>;
  saveFCMToken: (token: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/notifications?pageSize=50');
      const notifs: Notification[] = data.data;
      set({
        notifications: notifs,
        unreadCount: notifs.filter((n) => !n.readAt).length,
      });
    } catch {
      // silent
    } finally {
      set({ isLoading: false });
    }
  },

  markRead: async (id) => {
    await api.put(`/notifications/${id}/read`);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  dismiss: async (id) => {
    await api.put(`/notifications/${id}/dismiss`);
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      unreadCount: state.unreadCount,
    }));
  },

  markAllRead: async () => {
    await api.post('/notifications/read-all');
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
  },

  registerWebPush: async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const { data: vapidData } = await api.get('/notifications/vapid-key');
      const publicKey = vapidData.data?.publicKey;
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await api.post('/notifications/subscribe', subscription.toJSON());
    } catch (err) {
      console.warn('Web push registration failed:', err);
    }
  },

  saveFCMToken: async (token) => {
    await api.post('/notifications/fcm-token', { token });
  },
}));

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
