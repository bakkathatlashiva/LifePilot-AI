import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SuggestedTask, Email } from '../types';
import api from '../lib/api';

export interface GmailAccountStatus {
  isActive: boolean;
  tokenExpiry?: string;
  updatedAt?: string;
}

export interface GmailStatusData {
  account: GmailAccountStatus | null;
  recentLogs: Array<{
    id: string;
    status: string;
    startedAt: string;
    itemsFound: number;
    itemsNew: number;
    itemsUpdated?: number;
    errorMessage?: string;
  }>;
}

interface GmailState {
  suggestions: SuggestedTask[];
  emails: Email[];
  status: GmailStatusData | null;
  activeTab: 'suggestions' | 'emails';
  isSyncing: boolean;
  isLoading: boolean;
  lastFetchedAt: number | null;
  error: string | null;

  setActiveTab: (tab: 'suggestions' | 'emails') => void;
  fetchAll: (isSilent?: boolean) => Promise<void>;
  handleSync: () => Promise<void>;
  approveSuggestion: (id: string, overrides?: Record<string, unknown>) => Promise<any>;
  rejectSuggestion: (id: string) => Promise<void>;
}

export const useGmailStore = create<GmailState>()(
  persist(
    (set, get) => ({
      suggestions: [],
      emails: [],
      status: null,
      activeTab: 'suggestions',
      isSyncing: false,
      isLoading: false,
      lastFetchedAt: null,
      error: null,

      setActiveTab: (tab) => set({ activeTab: tab }),

      fetchAll: async (isSilent = false) => {
        // Only show loading if we have zero cached items
        const hasCached = get().suggestions.length > 0 || get().emails.length > 0;
        if (!isSilent && !hasCached) {
          set({ isLoading: true });
        }

        try {
          const [sugRes, emailRes, statusRes] = await Promise.all([
            api.get('/gmail/suggestions'),
            api.get('/gmail/emails?pageSize=50'),
            api.get('/gmail/status'),
          ]);

          set({
            suggestions: sugRes.data.data ?? [],
            emails: emailRes.data.data ?? [],
            status: statusRes.data.data ?? null,
            lastFetchedAt: Date.now(),
            error: null,
          });
        } catch (err: any) {
          set({ error: err.response?.data?.message ?? 'Failed to load Gmail data' });
        } finally {
          if (!isSilent || !hasCached) {
            set({ isLoading: false });
          }
        }
      },

      handleSync: async () => {
        set({ isSyncing: true });
        try {
          await api.post('/gmail/sync');
          // Re-fetch after 3.5s to let Gmail API digest
          setTimeout(() => {
            get().fetchAll(true).finally(() => set({ isSyncing: false }));
          }, 3500);
        } catch (err: any) {
          set({ isSyncing: false });
          throw err;
        }
      },

      approveSuggestion: async (id: string, overrides?: Record<string, unknown>) => {
        // Optimistic UI update: instantly remove from pending list so UI feels 0ms fast
        const target = get().suggestions.find((s) => s.id === id);
        set((state) => ({
          suggestions: state.suggestions.filter((s) => s.id !== id),
        }));

        try {
          const res = await api.post(`/gmail/suggestions/${id}/approve`, overrides ?? {});
          return res.data?.data;
        } catch (err) {
          // Rollback on network failure
          if (target) {
            set((state) => ({ suggestions: [target, ...state.suggestions] }));
          }
          throw err;
        }
      },

      rejectSuggestion: async (id: string) => {
        // Optimistic UI update
        const target = get().suggestions.find((s) => s.id === id);
        set((state) => ({
          suggestions: state.suggestions.filter((s) => s.id !== id),
        }));

        try {
          await api.post(`/gmail/suggestions/${id}/reject`);
        } catch (err) {
          if (target) {
            set((state) => ({ suggestions: [target, ...state.suggestions] }));
          }
          throw err;
        }
      },
    }),
    {
      name: 'lifepilot_gmail_cache',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        suggestions: state.suggestions,
        emails: state.emails,
        status: state.status,
        activeTab: state.activeTab,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);

