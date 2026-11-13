import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import api from '../lib/api';
import { ERPAssignment } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';

export function ERPScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [assignments, setAssignments] = useState<ERPAssignment[]>([]);
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Tabs: 'ALL' | 'AVAILABLE' | 'CLOSED'
  const [activeTab, setActiveTab] = useState<'ALL' | 'AVAILABLE' | 'CLOSED'>('ALL');

  // Modals
  const [selectedAssignment, setSelectedAssignment] = useState<ERPAssignment | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Setup modal state
  const [setupMode, setSetupMode] = useState<'credentials' | 'cookies'>('credentials');
  const [username, setUsername] = useState('252U1R9175');
  const [password, setPassword] = useState('');
  const [rawCookies, setRawCookies] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupSuccess, setSetupSuccess] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/erp/status');
      if (res.data?.data) {
        setConnection(res.data.data.connection);
      }
    } catch {}
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await api.get('/erp/assignments?pageSize=100');
      const raw = res.data?.data;
      const list = Array.isArray(raw) ? raw : (raw?.assignments ?? []);
      setAssignments(list);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchAssignments()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchStatus, fetchAssignments]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await api.post('/erp/sync');
      Alert.alert('Sync Started', 'Aurora ERP sync initiated. Refreshing in a moment...');
      setTimeout(() => {
        loadAll();
        setSyncing(false);
      }, 3500);
    } catch (err: any) {
      setSyncing(false);
      Alert.alert('Sync Error', err?.response?.data?.message || err?.message || 'Failed to trigger sync');
    }
  };

  const handleCredentialsSubmit = async () => {
    const cleanUser = username.trim();
    const cleanPass = password.trim();
    if (!cleanUser || !cleanPass) {
      setSetupError('Student ID and Password are required');
      return;
    }

    setSetupSaving(true);
    setSetupError('');
    setSetupSuccess('');

    try {
      const res = await api.post('/erp/connect-credentials', {
        username: cleanUser.includes('@') ? cleanUser : cleanUser.toUpperCase(),
        password: cleanPass,
      });

      setSetupSuccess(res.data?.message || 'Connected successfully!');
      setTimeout(() => {
        setShowSetupModal(false);
        loadAll();
      }, 800);
    } catch (err: any) {
      setSetupError(
        err?.response?.data?.message || err?.message || 'Failed to connect. Verify your credentials.'
      );
    } finally {
      setSetupSaving(false);
    }
  };

  const handleCookiesSubmit = async () => {
    const cleanCookies = rawCookies.trim();
    if (!cleanCookies) {
      setSetupError('Please paste your session cookies string or JSON');
      return;
    }

    setSetupSaving(true);
    setSetupError('');
    setSetupSuccess('');

    try {
      const res = await api.post('/erp/session', { rawCookies: cleanCookies });
      setSetupSuccess(res.data?.message || 'Connected with session cookies!');
      setTimeout(() => {
        setShowSetupModal(false);
        loadAll();
      }, 800);
    } catch (err: any) {
      setSetupError(
        err?.response?.data?.message || err?.message || 'Failed to authenticate using session cookies.'
      );
    } finally {
      setSetupSaving(false);
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    let ongoing = 0;
    let closed = 0;
    let newCount = 0;
    for (const a of assignments) {
      if (a.status === 'AVAILABLE') ongoing++;
      else if (a.status === 'CLOSED') closed++;
      if (a.isNew) newCount++;
    }
    return { total: assignments.length, ongoing, closed, newCount };
  }, [assignments]);

  // Filtered
  const filteredAssignments = useMemo(() => {
    if (activeTab === 'AVAILABLE') {
      return assignments.filter((a) => a.status === 'AVAILABLE');
    }
    if (activeTab === 'CLOSED') {
      return assignments.filter((a) => a.status === 'CLOSED');
    }
    return assignments;
  }, [assignments, activeTab]);

  const renderAssignmentCard = ({ item: a }: { item: ERPAssignment }) => {
    const isOngoing = a.status === 'AVAILABLE';
    const rawStatus = ((a.rawData as any)?.statusRaw || '').toUpperCase();
    const descUpper = (a.description || '').toUpperCase();
    const isEvaluated =
      descUpper.includes('EVALUATED') || descUpper.includes('RESULT') || rawStatus.includes('EVALUATED');
    const isSubmitted =
      descUpper.includes('SUBMITTED') || rawStatus.includes('SUBMITTED') || (!isOngoing && !isEvaluated);

    const badgeText = isOngoing ? 'Ongoing' : isEvaluated ? 'Evaluated' : isSubmitted ? 'Submitted' : 'Closed';
    const badgeVariant = isOngoing ? 'success' : isEvaluated ? 'info' : 'purple';

    return (
      <Card
        onClick={() => setSelectedAssignment(a)}
        style={styles.assignmentCard}
      >
        <View style={styles.cardHeader}>
          <View style={styles.tagRow}>
            {a.isNew && <Badge variant="info" dot>New</Badge>}
            <Badge variant={badgeVariant as any}>{badgeText}</Badge>
            {a.subject && (
              <View style={styles.subjectPill}>
                <Text style={styles.subjectPillText}>{a.subject}</Text>
              </View>
            )}
          </View>
          <Text style={styles.arrowIcon}>→</Text>
        </View>

        <Text style={styles.assignmentTitle} numberOfLines={2}>
          {a.title}
        </Text>

        {a.description ? (
          <Text style={styles.assignmentDesc} numberOfLines={2}>
            {a.description}
          </Text>
        ) : null}

        <View style={styles.dateRow}>
          {a.closingDate ? (
            <Text
              style={[
                styles.deadlineDate,
                isOngoing && { color: colors.amberLight, fontWeight: '700' },
              ]}
            >
              {isOngoing ? 'Due: ' : 'Deadline: '}
              {format(new Date(a.closingDate), 'MMM d, yyyy h:mm a')}
            </Text>
          ) : (
            <Text style={styles.noDeadline}>No deadline specified</Text>
          )}

          {a.maxMarks !== undefined && a.maxMarks !== null ? (
            <Text style={styles.marksText}>{a.maxMarks} Marks</Text>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="ERP Assignments"
        subtitle="Aurora University Assessment Portal"
        onOpenDrawer={() => setDrawerOpen(true)}
        rightAction={
          <View style={styles.headerActions}>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setShowSetupModal(true)}
              style={{ minHeight: 38, paddingHorizontal: 10 }}
            >
              Setup
            </Button>
            <Button
              size="sm"
              onPress={handleSyncNow}
              loading={syncing}
              style={{ minHeight: 38, paddingHorizontal: 12 }}
            >
              Sync
            </Button>
          </View>
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
        {/* Connection Status Card */}
        <Card style={styles.connCard}>
          <View style={styles.connHeader}>
            <View style={styles.connLeft}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      connection?.lastSyncStatus === 'SUCCESS'
                        ? colors.emerald
                        : connection?.lastSyncStatus === 'RUNNING'
                        ? colors.blue
                        : colors.amber,
                  },
                ]}
              />
              <View>
                <Text style={styles.connTitle}>Sidus Portal Monitor</Text>
                <Text style={styles.connSub}>
                  www.sidus.net · Sync every {connection?.monitoringInterval || 5}m
                </Text>
              </View>
            </View>

            <Badge
              variant={connection?.lastSyncStatus === 'SUCCESS' ? 'success' : 'warning'}
              size="sm"
            >
              {connection?.lastSyncStatus || 'ACTIVE'}
            </Badge>
          </View>

          {connection?.lastSyncAt ? (
            <Text style={styles.lastSyncText}>
              Last Synced: {format(new Date(connection.lastSyncAt), 'MMM d, h:mm a')}
            </Text>
          ) : null}
        </Card>

        {/* Metrics Grid */}
        <View style={styles.metricsRow}>
          <Card style={styles.metricCard}>
            <Text style={[styles.metricVal, { color: colors.text }]}>{metrics.total}</Text>
            <Text style={styles.metricLabel}>Total</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={[styles.metricVal, { color: colors.emeraldLight }]}>{metrics.ongoing}</Text>
            <Text style={styles.metricLabel}>Ongoing</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={[styles.metricVal, { color: colors.textMuted }]}>{metrics.closed}</Text>
            <Text style={styles.metricLabel}>Closed</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={[styles.metricVal, { color: colors.blueLight }]}>{metrics.newCount}</Text>
            <Text style={styles.metricLabel}>New</Text>
          </Card>
        </View>

        {/* Filter Segment Tabs */}
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'ALL' && styles.activeTabBtn]}
            onPress={() => setActiveTab('ALL')}
          >
            <Text style={[styles.tabText, activeTab === 'ALL' && styles.activeTabText]}>
              All ({metrics.total})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'AVAILABLE' && styles.activeTabBtn]}
            onPress={() => setActiveTab('AVAILABLE')}
          >
            <Text style={[styles.tabText, activeTab === 'AVAILABLE' && styles.activeTabText]}>
              Ongoing ({metrics.ongoing})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'CLOSED' && styles.activeTabBtn]}
            onPress={() => setActiveTab('CLOSED')}
          >
            <Text style={[styles.tabText, activeTab === 'CLOSED' && styles.activeTabText]}>
              Closed ({metrics.closed})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Assignment List */}
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading assignments...</Text>
          </View>
        ) : filteredAssignments.length === 0 ? (
          <EmptyState
            title="No assignments found"
            description="No assessments matching the current filter. Click Setup to connect your Aurora ERP session."
            action={{
              label: 'Connect ERP',
              onClick: () => setShowSetupModal(true),
            }}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredAssignments.map((a) => (
              <React.Fragment key={a.id}>
                {renderAssignmentCard({ item: a })}
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Assignment Detail Modal */}
      <Modal
        isOpen={Boolean(selectedAssignment)}
        onClose={() => setSelectedAssignment(null)}
        title="Assignment Details"
      >
        {selectedAssignment && (
          <View style={styles.modalContent}>
            <Text style={styles.detailTitle}>{selectedAssignment.title}</Text>
            {selectedAssignment.subject && (
              <Text style={styles.detailSubject}>{selectedAssignment.subject}</Text>
            )}

            {selectedAssignment.description ? (
              <View style={styles.detailDescBox}>
                <Text style={styles.detailDescText}>{selectedAssignment.description}</Text>
              </View>
            ) : null}

            <View style={styles.metaGrid}>
              {selectedAssignment.openingDate ? (
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Opening Date</Text>
                  <Text style={styles.metaVal}>
                    {format(new Date(selectedAssignment.openingDate), 'PPP p')}
                  </Text>
                </View>
              ) : null}

              {selectedAssignment.closingDate ? (
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Closing Date</Text>
                  <Text style={styles.metaVal}>
                    {format(new Date(selectedAssignment.closingDate), 'PPP p')}
                  </Text>
                </View>
              ) : null}

              {selectedAssignment.maxMarks !== undefined && (
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Max Marks</Text>
                  <Text style={styles.metaVal}>{selectedAssignment.maxMarks}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Modal>

      {/* ERP Session Setup Modal (Dual-Mode: Credentials vs Session Cookies) */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        title="ERP Session Setup"
      >
        <View style={styles.setupContainer}>
          {/* Mode Switcher */}
          <View style={styles.setupTabs}>
            <TouchableOpacity
              style={[
                styles.setupTabBtn,
                setupMode === 'credentials' && styles.activeSetupTab,
              ]}
              onPress={() => {
                setSetupMode('credentials');
                setSetupError('');
              }}
            >
              <Text
                style={[
                  styles.setupTabText,
                  setupMode === 'credentials' && styles.activeSetupTabText,
                ]}
              >
                Student ID & Pass
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.setupTabBtn,
                setupMode === 'cookies' && styles.activeSetupTab,
              ]}
              onPress={() => {
                setSetupMode('cookies');
                setSetupError('');
              }}
            >
              <Text
                style={[
                  styles.setupTabText,
                  setupMode === 'cookies' && styles.activeSetupTabText,
                ]}
              >
                Session Cookies ⚡
              </Text>
            </TouchableOpacity>
          </View>

          {setupMode === 'credentials' ? (
            <View style={{ gap: 14 }}>
              <View style={styles.infoBanner}>
                <Text style={styles.infoTitle}>Direct Portal Authentication</Text>
                <Text style={styles.infoDesc}>
                  Enter your Sidus ERP credentials. LifePilot verifies your account at www.sidus.net, encrypts your session, and starts automated monitoring.
                </Text>
              </View>

              <Input
                label="Student User ID / Email / Hall Ticket"
                value={username}
                onChangeText={setUsername}
                placeholder="252U1R9175"
              />

              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter ERP password"
                secureTextEntry
              />

              {setupError ? <Text style={styles.errorText}>{setupError}</Text> : null}
              {setupSuccess ? <Text style={styles.successText}>{setupSuccess}</Text> : null}

              <Button
                onPress={handleCredentialsSubmit}
                loading={setupSaving}
              >
                Authenticate & Sync ERP
              </Button>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <View style={styles.cookieBanner}>
                <Text style={styles.cookieTitle}>100% Cloud-Compatible Connection</Text>
                <Text style={styles.cookieDesc}>
                  Connects directly using your active browser session cookies. Bypasses Cloudflare WAF or datacenter IP restrictions with 0.3s sync!
                </Text>

                <View style={styles.codeSnippetBox}>
                  <Text style={styles.codeSnippetLabel}>How to get cookies from laptop/browser:</Text>
                  <Text style={styles.codeSnippet}>
                    1. Login to www.sidus.net{'\n'}
                    2. Press F12 &rarr; Console{'\n'}
                    3. Type copy(document.cookie) and Enter
                  </Text>
                </View>
              </View>

              <Input
                label="Paste Session Cookies"
                placeholder="connect.sid=s%3A...; csrf_token=..."
                value={rawCookies}
                onChangeText={setRawCookies}
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />

              {setupError ? <Text style={styles.errorText}>{setupError}</Text> : null}
              {setupSuccess ? <Text style={styles.successText}>{setupSuccess}</Text> : null}

              <Button
                onPress={handleCookiesSubmit}
                loading={setupSaving}
                variant="emerald"
              >
                Save Cookies & Sync ERP
              </Button>
            </View>
          )}
        </View>
      </Modal>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="ERP"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  connCard: { padding: 14, gap: 8 },
  connHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  connLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  connTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  connSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  lastSyncText: { fontSize: 11, color: colors.textSecondary },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, padding: 10, alignItems: 'center', gap: 2 },
  metricVal: { fontSize: 18, fontWeight: '700' },
  metricLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  filterTabs: {
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
  assignmentCard: { padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1 },
  subjectPill: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  subjectPillText: { fontSize: 11, color: colors.primaryLight, fontWeight: '600' },
  arrowIcon: { fontSize: 16, color: colors.textMuted },
  assignmentTitle: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 18 },
  assignmentDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  deadlineDate: { fontSize: 11, color: colors.textMuted },
  noDeadline: { fontSize: 11, color: colors.textMuted },
  marksText: { fontSize: 11, color: colors.primaryLight, fontWeight: '600' },
  loaderBox: { padding: 30, alignItems: 'center', gap: 10 },
  loaderText: { fontSize: 13, color: colors.textMuted },
  modalContent: { gap: 12 },
  detailTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  detailSubject: { fontSize: 13, color: colors.primaryLight, fontWeight: '600' },
  detailDescBox: {
    backgroundColor: colors.input,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailDescText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  metaGrid: { gap: 8 },
  metaBox: {
    backgroundColor: colors.input,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  metaVal: { fontSize: 12, color: colors.text, marginTop: 2, fontWeight: '500' },
  setupContainer: { gap: 16 },
  setupTabs: {
    flexDirection: 'row',
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setupTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  activeSetupTab: { backgroundColor: colors.primary },
  setupTabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  activeSetupTabText: { color: '#ffffff' },
  infoBanner: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: colors.borderPurple,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: colors.primaryLight },
  infoDesc: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  cookieBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  cookieTitle: { fontSize: 13, fontWeight: '700', color: colors.emeraldLight },
  cookieDesc: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  codeSnippetBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  codeSnippetLabel: { fontSize: 10, fontWeight: '700', color: colors.emeraldLight },
  codeSnippet: { fontSize: 10, color: colors.textMuted, fontFamily: 'monospace', lineHeight: 14 },
  errorText: { fontSize: 12, color: colors.redLight, fontWeight: '500' },
  successText: { fontSize: 12, color: colors.emeraldLight, fontWeight: '500' },
});
