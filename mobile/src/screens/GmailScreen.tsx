import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import api, { API_BASE_URL } from '../lib/api';
import { SuggestedTask, Email } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';

export function GmailScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'suggestions' | 'emails'>('suggestions');
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [status, setStatus] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{ title: string; taskId?: string } | null>(null);

  // Modals
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestedTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/gmail/status');
      if (res.data?.data) {
        setStatus(res.data.data);
      }
    } catch {}
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await api.get('/gmail/suggestions?isApproved=null');
      if (res.data?.data) {
        setSuggestions(res.data.data);
      }
    } catch {}
  }, []);

  const fetchEmails = useCallback(async () => {
    try {
      const res = await api.get('/gmail/emails?pageSize=30');
      if (res.data?.data) {
        setEmails(res.data.data);
      }
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchSuggestions(), fetchEmails()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchStatus, fetchSuggestions, fetchEmails]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const isConnected = Boolean(status?.isConnected);

  const handleConnectGmail = async () => {
    try {
      const returnTo = encodeURIComponent('lifepilot://auth/callback');
      const authUrl = `${API_BASE_URL}/auth/google/gmail?returnTo=${returnTo}`;
      await WebBrowser.openAuthSessionAsync(authUrl, 'lifepilot://auth/callback');
      loadAll();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to initiate Gmail authorization');
    }
  };

  const handleSyncMailbox = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/gmail/sync');
      Alert.alert(
        'Sync Complete',
        res.data?.message || 'Scanned recent mailbox messages and refreshed suggestions.'
      );
      loadAll();
    } catch (err: any) {
      Alert.alert('Sync Failed', err?.response?.data?.message || err?.message || 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleApprove = async (id: string, overrides?: Record<string, unknown>) => {
    setApprovingId(id);
    try {
      const targetItem = suggestions.find((s) => s.id === id);
      const res = await api.post(`/gmail/suggestions/${id}/approve`, overrides || {});
      const createdTask = res.data?.data?.task;

      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setSuccessToast({
        title: (overrides?.title as string) || targetItem?.title || 'Academic Task',
        taskId: createdTask?.id,
      });
      setTimeout(() => setSuccessToast(null), 7000);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.message || 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setRejectingId(id);
    try {
      await api.post(`/gmail/suggestions/${id}/reject`);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.message || 'Failed to reject');
    } finally {
      setRejectingId(null);
    }
  };

  const openEditModal = (s: SuggestedTask) => {
    setEditingSuggestion(s);
    setEditTitle(s.title);
    setEditDeadline(
      s.suggestedDueDate ? format(new Date(s.suggestedDueDate), 'yyyy-MM-dd HH:mm') : ''
    );
  };

  const handleSaveAndApprove = () => {
    if (!editingSuggestion) return;
    const overrides: Record<string, unknown> = {
      title: editTitle.trim() || editingSuggestion.title,
    };
    if (editDeadline.trim()) {
      const d = new Date(editDeadline);
      if (!isNaN(d.getTime())) overrides.deadline = d.toISOString();
    }
    const targetId = editingSuggestion.id;
    setEditingSuggestion(null);
    handleApprove(targetId, overrides);
  };

  const renderSuggestionCard = ({ item: s }: { item: SuggestedTask }) => {
    const isApproving = approvingId === s.id;
    const isRejecting = rejectingId === s.id;

    return (
      <Card style={styles.itemCard}>
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <Badge variant="purple" size="sm">
              {s.category.replace('_', ' ')}
            </Badge>
            <Badge
              variant={
                s.priority === 'CRITICAL' || s.priority === 'HIGH' ? 'danger' : 'warning'
              }
              size="sm"
            >
              {s.priority}
            </Badge>
            {s.aiConfidence ? (
              <Text style={styles.confidenceText}>
                {Math.round(s.aiConfidence * 100)}% Match
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.itemTitle}>{s.title}</Text>

        {s.description ? (
          <Text style={styles.itemDesc} numberOfLines={2}>
            {s.description}
          </Text>
        ) : null}

        {s.suggestedDueDate ? (
          <Text style={styles.dueDateText}>
            📅 Suggested Due: {format(new Date(s.suggestedDueDate), 'MMM d, yyyy h:mm a')}
          </Text>
        ) : null}

        {s.email?.subject ? (
          <View style={styles.emailRefBox}>
            <Text style={styles.emailRefText} numberOfLines={1}>
              ✉️ {s.email.subject}
            </Text>
          </View>
        ) : null}

        {/* Action Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => openEditModal(s)}
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnText}>✏️ Edit</Text>
          </TouchableOpacity>

          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleReject(s.id)}
            loading={isRejecting}
            style={styles.rejectBtn}
            textStyle={{ color: colors.redLight }}
          >
            Reject
          </Button>

          <Button
            size="sm"
            variant="primary"
            onPress={() => handleApprove(s.id)}
            loading={isApproving}
            style={styles.approveBtn}
          >
            ✓ Approve Task
          </Button>
        </View>
      </Card>
    );
  };

  const renderEmailCard = ({ item: email }: { item: Email }) => {
    return (
      <Card
        onClick={() => setSelectedEmail(email)}
        style={styles.itemCard}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            {email.aiCategory ? (
              <Badge variant="info" size="sm">
                {email.aiCategory.replace('_', ' ')}
              </Badge>
            ) : null}
            {email.isImportant && (
              <Badge variant="warning" size="sm">Important</Badge>
            )}
          </View>
          <Text style={styles.emailDate}>
            {email.receivedAt ? format(new Date(email.receivedAt), 'MMM d') : ''}
          </Text>
        </View>

        <Text style={styles.emailSender} numberOfLines={1}>
          {email.sender || 'Academic Office'}
        </Text>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {email.subject || '(No Subject)'}
        </Text>

        {email.aiSummary ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>✨ AI Summary</Text>
            <Text style={styles.summaryText} numberOfLines={2}>
              {email.aiSummary}
            </Text>
          </View>
        ) : email.snippet ? (
          <Text style={styles.itemDesc} numberOfLines={2}>
            {email.snippet}
          </Text>
        ) : null}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="Gmail Intel"
        subtitle="AI Notice Extraction & Task Suggestions"
        onOpenDrawer={() => setDrawerOpen(true)}
        rightAction={
          isConnected ? (
            <Button
              size="sm"
              onPress={handleSyncMailbox}
              loading={syncing}
              style={{ minHeight: 38, paddingHorizontal: 12 }}
            >
              Sync Mail
            </Button>
          ) : (
            <Button
              size="sm"
              onPress={handleConnectGmail}
              style={{ minHeight: 38, paddingHorizontal: 10 }}
            >
              Connect
            </Button>
          )
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Success Banner when task approved */}
        {successToast && (
          <View style={styles.successBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.successBannerTitle}>✓ Task Created Successfully!</Text>
              <Text style={styles.successBannerSub} numberOfLines={1}>
                {successToast.title}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.viewTasksBtn}
              onPress={() => navigation.navigate('Tasks')}
            >
              <Text style={styles.viewTasksBtnText}>View Tasks →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Connection Status Card */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? colors.emerald : colors.amber },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {isConnected ? '24/7 Gmail Monitoring Active' : 'Gmail Not Connected'}
              </Text>
              <Text style={styles.statusSub}>
                {isConnected
                  ? 'Automatically scans university emails every 5 minutes'
                  : 'Authorize Google to scan deadlines & notices'}
              </Text>
            </View>
            <Badge variant={isConnected ? 'success' : 'warning'} size="sm">
              {isConnected ? 'Active' : 'Offline'}
            </Badge>
          </View>
        </Card>

        {/* Tabs: Suggestions vs Emails */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'suggestions' && styles.activeTabBtn]}
            onPress={() => setActiveTab('suggestions')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'suggestions' && styles.activeTabText,
              ]}
            >
              Task Suggestions ({suggestions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'emails' && styles.activeTabBtn]}
            onPress={() => setActiveTab('emails')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'emails' && styles.activeTabText,
              ]}
            >
              Synced Emails ({emails.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main List */}
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Analyzing emails...</Text>
          </View>
        ) : activeTab === 'suggestions' ? (
          suggestions.length === 0 ? (
            <EmptyState
              title="No pending suggestions"
              description={
                isConnected
                  ? 'All academic emails processed! New assignments will appear here automatically.'
                  : 'Connect your Gmail account to let Gemini extract actionable tasks from your emails.'
              }
              action={{
                label: isConnected ? 'Sync Mailbox Now' : 'Connect Gmail',
                onClick: isConnected ? handleSyncMailbox : handleConnectGmail,
              }}
            />
          ) : (
            <View style={{ gap: 12 }}>
              {suggestions.map((s) => (
                <React.Fragment key={s.id}>
                  {renderSuggestionCard({ item: s })}
                </React.Fragment>
              ))}
            </View>
          )
        ) : emails.length === 0 ? (
          <EmptyState
            title="No emails synchronized"
            description={
              isConnected
                ? 'No recent academic emails found in the last 24 hours. Tap Sync to check.'
                : 'Connect your Gmail account to synchronize your university emails.'
            }
            action={{
              label: isConnected ? 'Sync Mailbox Now' : 'Connect Gmail',
              onClick: isConnected ? handleSyncMailbox : handleConnectGmail,
            }}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {emails.map((e) => (
              <React.Fragment key={e.id}>
                {renderEmailCard({ item: e })}
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Suggestion Modal */}
      <Modal
        isOpen={Boolean(editingSuggestion)}
        onClose={() => setEditingSuggestion(null)}
        title="Edit Task Suggestion"
      >
        <View style={{ gap: 14 }}>
          <Input
            label="Task Title"
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Edit title"
          />
          <Input
            label="Suggested Deadline (YYYY-MM-DD HH:mm)"
            value={editDeadline}
            onChangeText={setEditDeadline}
            placeholder="2026-11-15 23:59"
          />
          <Button onPress={handleSaveAndApprove}>
            Save & Approve Task
          </Button>
        </View>
      </Modal>

      {/* Email Reader Modal */}
      <Modal
        isOpen={Boolean(selectedEmail)}
        onClose={() => setSelectedEmail(null)}
        title="Email Details"
      >
        {selectedEmail && (
          <View style={{ gap: 12 }}>
            <Text style={styles.emailModalSubject}>{selectedEmail.subject}</Text>
            <View style={styles.emailMetaRow}>
              <Text style={styles.emailMetaSender}>{selectedEmail.sender}</Text>
              <Text style={styles.emailMetaDate}>
                {selectedEmail.receivedAt
                  ? format(new Date(selectedEmail.receivedAt), 'PPP p')
                  : ''}
              </Text>
            </View>

            {selectedEmail.aiSummary ? (
              <View style={styles.modalSummaryBox}>
                <Text style={styles.summaryLabel}>✨ AI Extracted Summary</Text>
                <Text style={styles.summaryText}>{selectedEmail.aiSummary}</Text>
              </View>
            ) : null}

            <View style={styles.emailBodyBox}>
              <Text style={styles.emailBodyText}>
                {selectedEmail.bodyText || selectedEmail.snippet || '(No content)'}
              </Text>
            </View>
          </View>
        )}
      </Modal>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Gmail"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  successBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  successBannerTitle: { fontSize: 13, fontWeight: '700', color: colors.emeraldLight },
  successBannerSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  viewTasksBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewTasksBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  statusCard: { padding: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  statusSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  activeTabBtn: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  activeTabText: { color: '#ffffff' },
  itemCard: { padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  confidenceText: { fontSize: 10, color: colors.primaryLight, fontWeight: '600' },
  itemTitle: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 18 },
  itemDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  dueDateText: { fontSize: 11, color: colors.amberLight, fontWeight: '500' },
  emailRefBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailRefText: { fontSize: 10, color: colors.textMuted },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  editBtnText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  rejectBtn: { flex: 1, minHeight: 36 },
  approveBtn: { flex: 2, minHeight: 36 },
  emailDate: { fontSize: 10, color: colors.textMuted },
  emailSender: { fontSize: 11, color: colors.primaryLight, fontWeight: '600' },
  summaryBox: {
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
    borderWidth: 1,
    borderColor: colors.borderPurple,
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: colors.primaryLight },
  summaryText: { fontSize: 11, color: colors.textSecondary, lineHeight: 15 },
  loaderBox: { padding: 40, alignItems: 'center', gap: 10 },
  loaderText: { fontSize: 13, color: colors.textMuted },
  emailModalSubject: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22 },
  emailMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emailMetaSender: { fontSize: 12, color: colors.primaryLight, fontWeight: '600' },
  emailMetaDate: { fontSize: 11, color: colors.textMuted },
  modalSummaryBox: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: colors.borderPurple,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  emailBodyBox: {
    backgroundColor: colors.input,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 280,
  },
  emailBodyText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
