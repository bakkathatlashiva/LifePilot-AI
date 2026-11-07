import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../lib/api';
import { format, isPast } from 'date-fns';

interface Task {
  id: string;
  title: string;
  category: string;
  deadline?: string;
  priority: string;
  status: string;
  description?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#10b981'
};

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: '#3b82f6', AVAILABLE: '#10b981', IN_PROGRESS: '#f59e0b',
  COMPLETED: '#64748b', OVERDUE: '#ef4444', CANCELLED: '#374151'
};

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = filter ? `?status=${filter}` : '';
      const { data } = await api.get(`/tasks${params}&pageSize=50`);
      setTasks(data.data);
    } catch {}
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks().finally(() => setLoading(false));
  }, [fetchTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  const completeTask = async (id: string) => {
    try {
      await api.put(`/tasks/${id}`, { status: 'COMPLETED' });
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: 'COMPLETED' } : t));
    } catch {
      Alert.alert('Error', 'Failed to complete task');
    }
  };

  const filters = ['UPCOMING', 'OVERDUE', 'IN_PROGRESS', 'COMPLETED'];

  const renderTask = ({ item: task }: { item: Task }) => {
    const isOverdue = task.status === 'OVERDUE';
    const isCompleted = task.status === 'COMPLETED';

    return (
      <View style={[styles.taskCard, isOverdue && styles.overdueCard]}>
        <View style={[styles.priorityBar, { backgroundColor: PRIORITY_COLORS[task.priority] ?? '#6366f1' }]} />
        <View style={styles.taskContent}>
          <Text style={[styles.taskTitle, isCompleted && styles.completedText]} numberOfLines={2}>
            {task.title}
          </Text>
          {task.description && (
            <Text style={styles.taskDesc} numberOfLines={1}>{task.description}</Text>
          )}
          <View style={styles.taskMeta}>
            <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[task.status] ?? '#6366f1') + '20' }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[task.status] ?? '#6366f1' }]}>
                {task.status.replace('_', ' ')}
              </Text>
            </View>
            {task.deadline && (
              <Text style={[styles.deadline, isOverdue && { color: '#ef4444' }]}>
                {isOverdue ? '⚠️ ' : '📅 '}
                {format(new Date(task.deadline), 'MMM d, yyyy')}
              </Text>
            )}
          </View>
        </View>
        {!isCompleted && (
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={() => completeTask(task.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.completeBtnText}>✓</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Tasks</Text>
        <Text style={styles.headerSub}>{tasks.length} tasks</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filter && styles.filterActive]}
          onPress={() => setFilter(null)}
        >
          <Text style={[styles.filterText, !filter && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterActive]}
            onPress={() => setFilter(filter === f ? null : f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#7c3aed" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyText}>No tasks here!</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filterActive: { backgroundColor: '#7c3aed20', borderColor: '#7c3aed50' },
  filterText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  filterTextActive: { color: '#a78bfa' },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 100 },
  taskCard: {
    backgroundColor: '#1e293b', borderRadius: 14, flexDirection: 'row',
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  overdueCard: { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: '#1f1515' },
  priorityBar: { width: 4 },
  taskContent: { flex: 1, padding: 14, gap: 6 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', lineHeight: 20 },
  completedText: { textDecorationLine: 'line-through', color: '#64748b' },
  taskDesc: { fontSize: 12, color: '#64748b' },
  taskMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '600' },
  deadline: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  completeBtn: {
    padding: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  completeBtnText: { fontSize: 16, color: '#10b981', fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: '#475569' },
});
