import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { smsGatewayEngine, GatewayState } from '../services/smsGatewayService';
import api from '../lib/api';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface SmsJob {
  id: string;
  recipientPhone: string;
  message: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RETRYING' | 'CANCELLED';
  retries?: number;
  scheduledAt: string;
  sentAt?: string | null;
  error?: string | null;
  simSlot?: number | null;
}

export function SmsGatewayScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [gatewayState, setGatewayState] = useState<GatewayState>(smsGatewayEngine.getState());
  const [isToggling, setIsToggling] = useState(false);
  const [recentJobs, setRecentJobs] = useState<SmsJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Quick SMS composer
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sendingInstant, setSendingInstant] = useState(false);

  // Telemetry listener
  useEffect(() => {
    const unsubscribe = smsGatewayEngine.subscribe((state: GatewayState) => {
      setGatewayState(state);
    });
    return unsubscribe;
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      setLoadingJobs(true);
      const res = await api.get('/sms/jobs?pageSize=15');
      if (res.data?.data) {
        setRecentJobs(res.data.data);
      }
    } catch {}
    finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }, [fetchJobs]);

  const handleToggleGateway = async (enable: boolean) => {
    setIsToggling(true);
    try {
      if (enable) {
        const res = await smsGatewayEngine.start();
        if (!res.success) {
          Alert.alert(
            'Permission Required',
            res.message || 'SMS permissions (SEND_SMS, READ_PHONE_STATE) are needed to send reminders via SIM.'
          );
        }
      } else {
        await smsGatewayEngine.stop();
      }
    } catch (error: any) {
      Alert.alert('Gateway Error', error?.message || 'Failed to update gateway status.');
    } finally {
      setIsToggling(false);
    }
  };

  const handleSendInstant = async () => {
    const cleanPhone = recipient.trim();
    const cleanMsg = message.trim();

    if (!cleanPhone) {
      Alert.alert('Invalid Number', 'Please enter a valid recipient phone number.');
      return;
    }
    if (!cleanMsg) {
      Alert.alert('Empty Message', 'Please enter a message to send.');
      return;
    }

    setSendingInstant(true);
    try {
      await api.post('/sms/jobs', {
        recipientPhone: cleanPhone,
        message: cleanMsg,
      });

      if (gatewayState.isActive) {
        const result = await smsGatewayEngine.sendImmediateSms(cleanPhone, cleanMsg);
        if (result.success) {
          Alert.alert('Success', `SMS dispatched immediately to ${cleanPhone} via your SIM card!`);
          setRecipient('');
          setMessage('');
        } else {
          Alert.alert('SMS Error', result.error || 'Failed to send via SIM.');
        }
      } else {
        Alert.alert(
          'Job Queued',
          'SMS job queued in backend. Turn ON the SIM Gateway switch above to dispatch pending SMS jobs.'
        );
        setRecipient('');
        setMessage('');
      }

      await fetchJobs();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.message || 'Failed to dispatch SMS.');
    } finally {
      setSendingInstant(false);
    }
  };

  const charCount = message.length;
  const smsSegments = Math.ceil(Math.max(charCount, 1) / 160);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <AppHeader
        title="SIM SMS Gateway"
        subtitle="Direct Physical SIM Card Dispatch Engine"
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Master Control Card */}
        <Card style={styles.masterCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBox}>
              <Text style={{ fontSize: 18 }}>📶</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.cardTitle}>Gateway Master Switch</Text>
              <Text style={styles.cardSubtitle}>
                {gatewayState.isActive
                  ? 'Active · Listening for scheduled reminders & SMS alerts'
                  : 'Gateway paused. Enable to process SMS queue'}
              </Text>
            </View>
            {isToggling ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Switch
                value={gatewayState.isActive}
                onValueChange={handleToggleGateway}
                thumbColor="#ffffff"
                trackColor={{ false: colors.input, true: colors.primary }}
              />
            )}
          </View>

          {/* Diagnostics Grid */}
          <View style={styles.divider} />
          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Device</Text>
              <Text style={styles.infoVal} numberOfLines={1}>{gatewayState.deviceName}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>SIM Carrier</Text>
              <Text style={styles.infoVal}>{gatewayState.simOperator || 'Active SIM'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Battery</Text>
              <Text style={styles.infoVal}>
                {gatewayState.batteryLevel}% {gatewayState.isCharging ? '⚡' : ''}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Processed</Text>
              <Text style={[styles.infoVal, { color: colors.emeraldLight }]}>
                {gatewayState.jobsProcessed} sent
              </Text>
            </View>
          </View>

          {/* Activity Status Bar */}
          <View style={styles.activityBox}>
            <Text style={styles.activityLabel}>Status:</Text>
            <Text style={styles.activityText} numberOfLines={1}>
              {gatewayState.currentActivity}
            </Text>
          </View>
        </Card>

        {/* Send Instant SMS Composer */}
        <Card style={styles.composerCard}>
          <Text style={styles.sectionTitle}>💬 Send SMS via Phone SIM</Text>
          <Text style={styles.sectionSubtitle}>
            Dispatches directly through your phone's carrier — 100% free with unlimited SMS packs.
          </Text>

          <Input
            label="Recipient Phone Number"
            placeholder="+919550802806 or 10-digit number"
            keyboardType="phone-pad"
            value={recipient}
            onChangeText={setRecipient}
          />

          <View style={{ gap: 6 }}>
            <View style={styles.msgHeaderRow}>
              <Text style={styles.inputLabel}>Message Content</Text>
              <Text style={styles.charCounter}>
                {charCount} chars ({smsSegments} SMS {smsSegments > 1 ? 'parts' : 'part'})
              </Text>
            </View>
            <Input
              placeholder="Type your alert, assignment reminder, or notice..."
              multiline
              numberOfLines={3}
              value={message}
              onChangeText={setMessage}
              style={{ minHeight: 70, textAlignVertical: 'top' }}
            />
          </View>

          <Button
            onPress={handleSendInstant}
            loading={sendingInstant}
          >
            {gatewayState.isActive ? '🚀 Send Directly via SIM' : '📤 Queue in Gateway'}
          </Button>
        </Card>

        {/* Queue & History */}
        <Card style={styles.historyCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📋 SMS Dispatch History</Text>
            <TouchableOpacity onPress={fetchJobs}>
              <Text style={styles.refreshLink}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {loadingJobs && recentJobs.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : recentJobs.length === 0 ? (
            <Text style={styles.emptyText}>No SMS jobs dispatched yet.</Text>
          ) : (
            <View style={styles.jobList}>
              {recentJobs.map((job) => {
                const badgeVariant =
                  job.status === 'SENT'
                    ? 'success'
                    : job.status === 'PROCESSING'
                    ? 'info'
                    : job.status === 'FAILED'
                    ? 'danger'
                    : 'warning';

                return (
                  <View key={job.id} style={styles.jobItem}>
                    <View style={styles.jobTopRow}>
                      <Text style={styles.jobPhone}>📱 {job.recipientPhone}</Text>
                      <Badge variant={badgeVariant as any} size="sm">
                        {job.status}
                      </Badge>
                    </View>
                    <Text style={styles.jobMsg} numberOfLines={2}>{job.message}</Text>
                    <Text style={styles.jobTime}>
                      {format(new Date(job.scheduledAt), 'MMM d, h:mm a')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="SMSGateway"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  masterCard: { padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  cardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', marginVertical: 4 },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { flex: 1, alignItems: 'center', gap: 2 },
  infoLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  infoVal: { fontSize: 12, color: colors.text, fontWeight: '600' },
  activityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.input,
    padding: 8,
    borderRadius: 8,
  },
  activityLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  activityText: { fontSize: 11, color: colors.primaryLight, flex: 1 },
  composerCard: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  sectionSubtitle: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  msgHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  charCounter: { fontSize: 10, color: colors.textMuted },
  historyCard: { padding: 16, gap: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshLink: { fontSize: 12, color: colors.primaryLight, fontWeight: '600' },
  emptyText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginVertical: 14 },
  jobList: { gap: 10 },
  jobItem: {
    backgroundColor: colors.input,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobPhone: { fontSize: 12, fontWeight: '700', color: colors.text },
  jobMsg: { fontSize: 11, color: colors.textSecondary, lineHeight: 15 },
  jobTime: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
});
