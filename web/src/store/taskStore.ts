import { create } from 'zustand';
import { Task, DashboardStats } from '../types';
import api from '../lib/api';

interface TaskState {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  filters: {
    status?: string;
    category?: string;
    priority?: string;
    search?: string;
  };
  setFilters: (filters: TaskState['filters']) => void;
  fetchTasks: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createTask: (input: Record<string, unknown>) => Promise<Task>;
  updateTask: (id: string, input: Record<string, unknown>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  total: 0,
  page: 1,
  pageSize: 100,
  stats: null,
  isLoading: false,
  error: null,
  filters: {},

  setFilters: (filters) => {
    set({ filters, page: 1 });
    get().fetchTasks();
  },

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, page, pageSize } = get();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const { data } = await api.get(`/tasks?${params}`);
      set({ tasks: data.data, total: data.meta?.total ?? 0 });
    } catch (err: any) {
      set({ error: err.response?.data?.message ?? 'Failed to load tasks' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchStats: async () => {
    try {
      const { data } = await api.get('/tasks/stats');
      set({ stats: data.data });
    } catch {
      // non-critical
    }
  },

  createTask: async (input) => {
    const { data } = await api.post('/tasks', input);
    get().fetchTasks();
    get().fetchStats();
    return data.data;
  },

  updateTask: async (id, input) => {
    const { data } = await api.put(`/tasks/${id}`, input);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? data.data : t)),
    }));
    get().fetchStats();
    return data.data;
  },

  deleteTask: async (id) => {
    await api.delete(`/tasks/${id}`);
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    get().fetchStats();
  },

  completeTask: async (id) => {
    await get().updateTask(id, { status: 'COMPLETED' });
  },
}));
