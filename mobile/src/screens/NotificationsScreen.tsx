import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import api from '../lib/api';
import { NotificationItem } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications?pageSize=50');
      setNotifications(data.data || []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    try {
      await api.put(`/notifications/${id}/read`);
    } catch {
      fetchNotifications();
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
    );
    try {
      await api.post('/notifications/read-all');
    } catch {
      fetchNotifications();
    }
  };

  const dismiss = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      fetchNotifications();
    }
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const notifTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      PUSH_ANDROID: '📱',
      PUSH_WEB: '🔔',
      EMAIL: '📧',
      SMS: '💬',
      IN_APP: '🔔',
    };
    return icons[type] ?? '🔔';
  };

  const renderItem = ({ item: n }: { item: NotificationItem }) => {
    const isUnread = !n.readAt;

    return (
      <Card
        style={[
          styles.notifCard,
          isUnread ? styles.unreadCard : { opacity: 0.75 },
        ]}
      >
        <View style={styles.cardRow}>
          {/* Type Icon Badge */}
          <View
            style={[
              styles.iconBox,
              isUnread ? styles.unreadIconBox : styles.readIconBox,
            ]}
          >
            <Text style={{ fontSize: 18 }}>{notifTypeIcon(n.type)}</Text>
          </View>

          {/* Content */}
          <View style={styles.contentBox}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.title,
                  isUnread ? styles.unreadTitle : styles.readTitle,
                ]}
                numberOfLines={1}
              >
                {n.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>

            <Text style={styles.bodyText} numberOfLines={3}>
              {n.body}
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.timeText}>
                {formatDistanceToNow(new Date(n.scheduledAt), { addSuffix: true })}
              </Text>
              <Badge variant="ghost" size="sm">
                {n.type}
              </Badge>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionCol}>
            {isUnread && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => markRead(n.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.checkIcon}>✓</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => dismiss(n.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.dismissIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
        onOpenDrawer={() => setDrawerOpen(true)}
        rightAction={
          unreadCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onPress={markAllRead}
              style={{ minHeight: 36, paddingHorizontal: 10 }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>Loading notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyBox}>
          <EmptyState
            title="No notifications yet"
            description="You're all caught up! New assignment and exam alerts will appear here."
          />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Notifications"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 16, gap: 10, paddingBottom: 100 },
  notifCard: { padding: 12 },
  unreadCard: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: colors.borderPurple,
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadIconBox: { backgroundColor: colors.primaryMuted },
  readIconBox: { backgroundColor: colors.input },
  contentBox: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '700', flex: 1 },
  unreadTitle: { color: colors.text },
  readTitle: { color: colors.textSecondary },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryLight,
  },
  bodyText: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  timeText: { fontSize: 10, color: colors.textMuted },
  actionCol: { gap: 6, alignItems: 'center' },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: { color: colors.emeraldLight, fontSize: 12, fontWeight: '700' },
  dismissIcon: { color: colors.textMuted, fontSize: 11 },
  loaderBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { fontSize: 13, color: colors.textMuted },
  emptyBox: { flex: 1, padding: 20, justifyContent: 'center' },
});
