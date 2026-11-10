import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { Task, DashboardStats } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export function DashboardScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [briefing, setBriefing] = useState('');
  const [erpStatus, setErpStatus] = useState<any>(null);
  const [gmailStatus, setGmailStatus] = useState<any>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingErp, setSyncingErp] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, statsRes, erpRes, gmailRes] = await Promise.all([
        api.get('/tasks?pageSize=6&status=UPCOMING'),
        api.get('/tasks/stats'),
        api.get('/erp/status').catch(() => ({ data: { data: null } })),
        api.get('/gmail/status').catch(() => ({ data: { data: null } })),
      ]);
      setTasks(tasksRes.data?.data || []);
      setStats(statsRes.data?.data || null);
      setErpStatus(erpRes.data?.data?.connection || null);
      setGmailStatus(gmailRes.data?.data || null);
    } catch {}
  }, []);

  const fetchBriefing = useCallback(async () => {
    try {
      const type = new Date().getHours() >= 17 ? 'evening' : 'morning';
      const { data } = await api.get(`/ai/briefing/${type}`);
      setBriefing(data.data?.briefing || '');
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchData(), fetchBriefing()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchData, fetchBriefing]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const handleSyncErp = async () => {
    setSyncingErp(true);
    try {
      await api.post('/erp/sync');
      setTimeout(() => {
        fetchData();
        setSyncingErp(false);
      }, 3000);
    } catch {
      setSyncingErp(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    const name = user?.name?.split(' ')[0] ?? 'Student';
    if (h < 12) return `Good morning, ${name}! ☀️`;
    if (h < 17) return `Good afternoon, ${name}! 👋`;
    return `Good evening, ${name}! 🌙`;
  };

  const priorityColor = (p: string) =>
    colors.priority[p as keyof typeof colors.priority] ?? colors.primary;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Top App Header */}
      <AppHeader
        title={getGreeting()}
        subtitle={`${format(new Date(), 'EEEE, MMMM d, yyyy')} · Academic Hub`}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.primaryLight }]}>
                {stats.total}
              </Text>
              <Text style={styles.statLabel}>Total</Text>
            </Card>

            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.emeraldLight }]}>
                {stats.completed}
              </Text>
              <Text style={styles.statLabel}>Done</Text>
            </Card>

            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.redLight }]}>
                {stats.overdue}
              </Text>
              <Text style={styles.statLabel}>Overdue</Text>
            </Card>

            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.amberLight }]}>
                {stats.dueToday}
              </Text>
              <Text style={styles.statLabel}>Today</Text>
            </Card>
          </View>
        )}

        {/* Completion Progress Bar */}
        {stats && (
          <Card style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Completion Rate</Text>
              <Text style={styles.progressValue}>{stats.completionRate}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.max(0, stats.completionRate))}%` },
                ]}
              />
            </View>
          </Card>
        )}

        {/* AI Daily Briefing */}
        {briefing ? (
          <Card style={styles.briefingCard}>
            <View style={styles.briefingHeader}>
              <Text style={styles.briefingTitle}>✨ Gemini Academic Briefing</Text>
            </View>
            <Text style={styles.briefingText}>{briefing}</Text>
          </Card>
        ) : null}

        {/* Live Academic Integrations Row */}
        <View style={styles.integrationsRow}>
          {/* Aurora ERP Card */}
          <Card style={styles.integrationCard}>
            <View style={styles.integHeader}>
              <View style={styles.integTitleRow}>
                <Text style={{ fontSize: 16 }}>📋</Text>
                <Text style={styles.integTitle}>Aurora ERP</Text>
              </View>
              <Badge
                variant={erpStatus?.lastSyncStatus === 'SUCCESS' ? 'success' : 'warning'}
                size="sm"
              >
                {erpStatus?.lastSyncStatus || 'IDLE'}
              </Badge>
            </View>
            <Text style={styles.integSub} numberOfLines={1}>
              {erpStatus?.lastSyncAt
                ? `Synced ${format(new Date(erpStatus.lastSyncAt), 'MMM d, h:mm a')}`
                : 'Automated 24/7 Monitor'}
            </Text>
            <View style={styles.integBtnRow}>
              <Button
                size="sm"
                variant="outline"
                onPress={() => navigation.navigate('ERP')}
                style={{ flex: 1, minHeight: 34 }}
              >
                View
              </Button>
              <Button
                size="sm"
                onPress={handleSyncErp}
                loading={syncingErp}
                style={{ flex: 1, minHeight: 34 }}
              >
                Sync
              </Button>
            </View>
          </Card>

          {/* Gmail Intel Card */}
          <Card style={styles.integrationCard}>
            <View style={styles.integHeader}>
              <View style={styles.integTitleRow}>
                <Text style={{ fontSize: 16 }}>📧</Text>
                <Text style={styles.integTitle}>Gmail Intel</Text>
              </View>
              <Badge
                variant={gmailStatus?.isConnected ? 'success' : 'warning'}
                size="sm"
              >
                {gmailStatus?.isConnected ? 'Active' : 'Offline'}
              </Badge>
            </View>
            <Text style={styles.integSub} numberOfLines={1}>
              {gmailStatus?.isConnected
                ? 'AI Notice Extraction Active'
                : 'Connect to extract tasks'}
            </Text>
            <View style={styles.integBtnRow}>
              <Button
                size="sm"
                variant="outline"
                onPress={() => navigation.navigate('Gmail')}
                style={{ flex: 1, minHeight: 34 }}
              >
                View
              </Button>
            </View>
          </Card>
        </View>

        {/* SIM SMS Gateway Banner */}
        <TouchableOpacity
          style={styles.gatewayBanner}
          onPress={() => navigation.navigate('SMSGateway')}
          activeOpacity={0.85}
        >
          <View style={styles.gatewayBannerLeft}>
            <View style={styles.gatewayIconBox}>
              <Text style={{ fontSize: 18 }}>📶</Text>
            </View>
            <View>
              <Text style={styles.gatewayBannerTitle}>Personal SIM SMS Gateway</Text>
              <Text style={styles.gatewayBannerSubtitle}>
                Dispatch assignment deadline alerts via phone SIM
              </Text>
            </View>
          </View>
          <Text style={styles.gatewayBannerArrow}>→</Text>
        </TouchableOpacity>

        {/* Upcoming Tasks Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
              <Text style={styles.seeAllText}>See all ({tasks.length}) →</Text>
            </TouchableOpacity>
          </View>

          {tasks.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>🎉 You're all caught up with your tasks!</Text>
            </Card>
          ) : (
            tasks.map((task) => (
              <Card
                key={task.id}
                style={[
                  styles.taskCard,
                  { borderLeftColor: priorityColor(task.priority), borderLeftWidth: 3 },
                ]}
                onClick={() => navigation.navigate('Tasks')}
              >
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle} numberOfLines={2}>
                    {task.title}
                  </Text>
                  <View style={styles.taskMeta}>
                    <Text style={styles.taskCategory}>
                      {task.category.replace('_', ' ')}
                    </Text>
                    {task.deadline && (
                      <Text style={styles.taskDeadline}>
                        Due {format(new Date(task.deadline), 'MMM d, h:mm a')}
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={[styles.priorityDot, { backgroundColor: priorityColor(task.priority) }]}
                />
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Dashboard"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 100 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, padding: 12, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  progressCard: { padding: 14, gap: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  progressValue: { fontSize: 12, color: colors.primaryLight, fontWeight: '700' },
  progressTrack: { height: 6, backgroundColor: colors.input, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  briefingCard: {
    padding: 14,
    gap: 8,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: colors.borderPurple,
  },
  briefingHeader: { flexDirection: 'row', alignItems: 'center' },
  briefingTitle: { fontSize: 13, fontWeight: '700', color: colors.primaryLight },
  briefingText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  integrationsRow: { flexDirection: 'row', gap: 10 },
  integrationCard: { flex: 1, padding: 12, gap: 8 },
  integHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  integTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  integTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  integSub: { fontSize: 10, color: colors.textMuted },
  integBtnRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  gatewayBanner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderPurple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gatewayBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  gatewayIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayBannerTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  gatewayBannerSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  gatewayBannerArrow: { fontSize: 16, color: colors.primaryLight, fontWeight: '700', marginLeft: 8 },
  section: { gap: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  seeAllText: { fontSize: 12, color: colors.primaryLight, fontWeight: '600' },
  taskCard: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  taskContent: { flex: 1, gap: 4 },
  taskTitle: { fontSize: 13, fontWeight: '600', color: colors.text, lineHeight: 18 },
  taskMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  taskCategory: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  taskDeadline: { fontSize: 11, color: colors.amberLight, fontWeight: '500' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  emptyCard: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
