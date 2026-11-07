import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  scheduledAt: string;
  readAt?: string;
}

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications?pageSize=50');
      setNotifications(data.data);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch().finally(() => setLoading(false));
  }, [fetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)
      );
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const renderItem = ({ item: n }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notifCard, !n.readAt && styles.unreadCard]}
      onPress={() => !n.readAt && markRead(n.id)}
      activeOpacity={0.8}
    >
      <View style={[styles.dot, !n.readAt && styles.unreadDot]} />
      <View style={styles.notifContent}>
        <Text style={[styles.notifTitle, !n.readAt && styles.unreadTitle]}>{n.title}</Text>
        <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
        <Text style={styles.notifTime}>
          {formatDistanceToNow(new Date(n.scheduledAt), { addSuffix: true })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#7c3aed" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  headerSub: { fontSize: 12, color: '#a78bfa', marginTop: 2 },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1e293b', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  markAllText: { fontSize: 12, color: '#94a3b8' },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 100 },
  notifCard: {
    backgroundColor: '#1e293b', borderRadius: 14, padding: 14,
    flexDirection: 'row', gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  unreadCard: { backgroundColor: '#1e1b4b20', borderColor: 'rgba(124,58,237,0.2)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#374151', marginTop: 6, flexShrink: 0 },
  unreadDot: { backgroundColor: '#7c3aed' },
  notifContent: { flex: 1, gap: 4 },
  notifTitle: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  unreadTitle: { color: '#e2e8f0' },
  notifBody: { fontSize: 12, color: '#64748b', lineHeight: 18 },
  notifTime: { fontSize: 11, color: '#475569', marginTop: 2 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: '#475569' },
});
