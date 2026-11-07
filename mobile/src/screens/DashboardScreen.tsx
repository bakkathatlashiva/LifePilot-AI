import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { format } from 'date-fns';

interface Task {
  id: string;
  title: string;
  category: string;
  deadline?: string;
  priority: string;
  status: string;
}

interface Stats {
  total: number;
  completed: number;
  overdue: number;
  dueToday: number;
  completionRate: number;
}

export function DashboardScreen() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [briefing, setBriefing] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        api.get('/tasks?pageSize=10&status=UPCOMING'),
        api.get('/tasks/stats'),
      ]);
      setTasks(tasksRes.data.data);
      setStats(statsRes.data.data);
    } catch {}
  }, []);

  const fetchBriefing = useCallback(async () => {
    try {
      const type = new Date().getHours() >= 17 ? 'evening' : 'morning';
      const { data } = await api.get(`/ai/briefing/${type}`);
      setBriefing(data.data.briefing);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchData(), fetchBriefing()]);
    setLoading(false);
  }, [fetchData, fetchBriefing]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const greeting = () => {
    const h = new Date().getHours();
    const name = user?.name?.split(' ')[0] ?? '';
    if (h < 12) return `Good morning, ${name}! ☀️`;
    if (h < 17) return `Good afternoon, ${name}! 👋`;
    return `Good evening, ${name}! 🌙`;
  };

  const priorityColor = (p: string) => ({
    CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#10b981'
  }[p] ?? '#6366f1');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>{format(new Date(), 'EEEE, MMMM d, yyyy')}</Text>
          </View>
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.statsGrid}>
            <StatCard label="Total" value={stats.total} color="#6366f1" />
            <StatCard label="Done" value={stats.completed} color="#10b981" />
            <StatCard label="Overdue" value={stats.overdue} color="#ef4444" />
            <StatCard label="Today" value={stats.dueToday} color="#f59e0b" />
          </View>
        )}

        {/* Progress bar */}
        {stats && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Completion Rate</Text>
              <Text style={styles.progressValue}>{stats.completionRate}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${stats.completionRate}%` }]} />
            </View>
          </View>
        )}

        {/* AI Briefing */}
        {briefing ? (
          <View style={styles.briefingCard}>
            <Text style={styles.sectionTitle}>✨ AI Daily Briefing</Text>
            <Text style={styles.briefingText}>{briefing}</Text>
          </View>
        ) : null}

        {/* Upcoming tasks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
          {tasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>🎉 You're all caught up!</Text>
            </View>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={[styles.taskCard, { borderLeftColor: priorityColor(task.priority) }]}>
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
                  <View style={styles.taskMeta}>
                    <Text style={styles.taskCategory}>{task.category.replace('_', ' ')}</Text>
                    {task.deadline && (
                      <Text style={styles.taskDeadline}>
                        Due {format(new Date(task.deadline), 'MMM d')}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={[styles.priorityDot, { backgroundColor: priorityColor(task.priority) }]} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loadingContainer: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#64748b', fontSize: 14 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  date: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#1e293b', borderRadius: 14, padding: 14,
    borderTopWidth: 3, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 10, color: '#64748b', fontWeight: '500' },
  progressCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, gap: 10 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  progressValue: { fontSize: 13, color: '#7c3aed', fontWeight: '700' },
  progressTrack: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#7c3aed', borderRadius: 4 },
  briefingCard: { backgroundColor: '#1e1b4b', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#312e81' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e2e8f0', marginBottom: 4 },
  taskCard: {
    backgroundColor: '#1e293b', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderLeftWidth: 3,
  },
  taskContent: { flex: 1, gap: 4 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', lineHeight: 20 },
  taskMeta: { flexDirection: 'row', gap: 8 },
  taskCategory: { fontSize: 11, color: '#64748b', textTransform: 'capitalize' },
  taskDeadline: { fontSize: 11, color: '#f59e0b', fontWeight: '500' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  emptyCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#64748b' },
  briefingText: { fontSize: 13, color: '#a5b4fc', lineHeight: 20 },
});
