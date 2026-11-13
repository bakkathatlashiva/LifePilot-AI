import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ERPAssignment } from '../types';
import api from '../lib/api';

export interface ERPConnectionStatus {
  id: string;
  erpUrl?: string;
  monitoringInterval: number;
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
  _count?: { assignments: number };
}

export interface ERPStatusData {
  connection: ERPConnectionStatus | null;
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

interface ERPState {
  assignments: ERPAssignment[];
  status: ERPStatusData | null;
  monitoringInterval: number;
  filterTab: 'ALL' | 'AVAILABLE' | 'CLOSED';
  isSyncing: boolean;
  isLoading: boolean;
  lastFetchedAt: number | null;
  error: string | null;

  setFilterTab: (tab: 'ALL' | 'AVAILABLE' | 'CLOSED') => void;
  setAssignments: (assignments: ERPAssignment[]) => void;
  fetchAssignments: (isSilent?: boolean) => Promise<void>;
  pollSyncStatus: () => Promise<void>;
  triggerSync: () => Promise<void>;
  updateInterval: (newInterval: number) => Promise<boolean>;
}

export const useERPStore = create<ERPState>()(
  persist(
    (set, get) => ({
      assignments: [],
      status: null,
      monitoringInterval: 30,
      filterTab: 'ALL',
      isSyncing: false,
      isLoading: false,
      lastFetchedAt: null,
      error: null,

      setFilterTab: (tab) => set({ filterTab: tab }),

      setAssignments: (assignments) => set({ assignments, lastFetchedAt: Date.now() }),

      fetchAssignments: async (isSilent = false) => {
        // Only show loading if we have zero cached assignments
        const hasCached = get().assignments.length > 0;
        if (!isSilent && !hasCached) {
          set({ isLoading: true });
        }

        try {
          const [statusRes, assignmentsRes] = await Promise.all([
            api.get('/erp/status'),
            api.get('/erp/assignments?pageSize=100'),
          ]);

          const statusData: ERPStatusData = statusRes.data.data;
          const rawAssignments: ERPAssignment[] = assignmentsRes.data.data.assignments ?? [];
          const activeAssignments = rawAssignments.filter((a) => a.status !== 'UPCOMING');

          set({
            status: statusData,
            assignments: activeAssignments,
            monitoringInterval: statusData.connection?.monitoringInterval ?? get().monitoringInterval,
            lastFetchedAt: Date.now(),
            error: null,
          });
        } catch (err: any) {
          // If we already had cached assignments, do not wipe them
          set({ error: err.response?.data?.message ?? 'Failed to load ERP data' });
        } finally {
          if (!isSilent || !hasCached) {
            set({ isLoading: false });
          }
        }
      },

      pollSyncStatus: async () => {
        try {
          const res = await api.get('/erp/status');
          const latestStatus: ERPStatusData = res.data.data;
          const currentStatus = get().status;

          const statusChanged =
            !currentStatus ||
            currentStatus.connection?.lastSyncStatus !== latestStatus.connection?.lastSyncStatus ||
            currentStatus.connection?.lastSyncAt !== latestStatus.connection?.lastSyncAt ||
            currentStatus.connection?._count?.assignments !== latestStatus.connection?._count?.assignments;

          if (statusChanged) {
            set({ status: latestStatus });
          }

          const syncStatus = latestStatus.connection?.lastSyncStatus;
          if (syncStatus === 'SUCCESS' || syncStatus === 'FAILED') {
            set({ isSyncing: false });
            // Re-fetch assignments silently in background
            get().fetchAssignments(true);
          }
        } catch {
          // ignore transient poll error
        }
      },

      triggerSync: async () => {
        set({ isSyncing: true });
        try {
          await api.post('/erp/sync');
          setTimeout(() => get().pollSyncStatus(), 600);
        } catch (err: any) {
          set({ isSyncing: false });
          throw err;
        }
      },

      updateInterval: async (newInterval: number) => {
        try {
          await api.put('/erp/settings', { monitoringInterval: newInterval });
          set({ monitoringInterval: newInterval });
          get().fetchAssignments(true);
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'lifepilot_erp_cache',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        assignments: state.assignments,
        status: state.status,
        monitoringInterval: state.monitoringInterval,
        filterTab: state.filterTab,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);

