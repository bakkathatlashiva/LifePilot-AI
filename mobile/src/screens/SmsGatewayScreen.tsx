import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Switch, RefreshControl, ActivityIndicator, Alert, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { smsGatewayEngine, GatewayState } from '../services/smsGatewayService';
import api from '../lib/api';
import { format } from 'date-fns';

interface SmsJob {
  id: string;
  recipientPhone: string;
  message: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RETRYING' | 'CANCELLED';
  retries: number;
  scheduledAt: string;
  sentAt?: string | null;
  error?: string | null;
  simSlot?: number | null;
}

export function SmsGatewayScreen() {
  const [gatewayState, setGatewayState] = useState<GatewayState>(smsGatewayEngine.getState());
  const [isToggling, setIsToggling] = useState(false);
  const [recentJobs, setRecentJobs] = useState<SmsJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Quick SMS composer
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sendingInstant, setSendingInstant] = useState(false);

  // Subscribe to live gateway telemetry
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
    } catch (err: any) {
      console.warn('Failed to load SMS jobs:', err?.message);
    } finally {
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
      // Create job in backend so history is preserved
      const res = await api.post('/sms/jobs', {
        recipientPhone: cleanPhone,
        message: cleanMsg,
      });

      const createdJob = res.data?.data;
      if (gatewayState.isActive) {
        // If gateway is running on this device, dispatch immediately via SIM
        const result = await smsGatewayEngine.sendImmediateSms(cleanPhone, cleanMsg);
        if (result.success) {
          Alert.alert('Success', `SMS sent successfully to ${cleanPhone} via your SIM card!`);
          setRecipient('');
          setMessage('');
        } else {
          Alert.alert('SMS Failed', result.error || 'Failed to send via SIM.');
        }
      } else {
        Alert.alert(
          'Job Queued',
          'SMS job queued in backend. Turn ON the SIM Gateway toggle to dispatch pending SMS jobs.'
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SENT': return '#10b981';
      case 'PROCESSING': return '#3b82f4';
      case 'RETRYING': return '#f59e0b';
      case 'FAILED': return '#ef4444';
      case 'CANCELLED': return '#64748b';
      default: return '#8b5cf6';
    }
  };

  const charCount = message.length;
  const smsSegments = Math.ceil(Math.max(charCount, 1) / 160);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>SIM SMS Gateway</Text>
            <Text style={styles.subtitle}>Direct native SIM card dispatch engine</Text>
          </View>
          <View style={[styles.statusPill, gatewayState.isActive ? styles.pillOnline : styles.pillOffline]}>
            <View style={[styles.dot, gatewayState.isActive ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.pillText}>{gatewayState.isActive ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Master Control Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📶</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.cardTitle}>Gateway Master Switch</Text>
              <Text style={styles.cardSubtitle}>
                {gatewayState.isActive
                  ? 'Listening for scheduled reminders & SMS alerts'
                  : 'Gateway paused. Enable to process SMS queue'}
              </Text>
            </View>
            {isToggling ? (
              <ActivityIndicator color="#7c3aed" size="small" />
            ) : (
              <Switch
                value={gatewayState.isActive}
                onValueChange={handleToggleGateway}
                thumbColor={gatewayState.isActive ? '#ffffff' : '#94a3b8'}
                trackColor={{ false: '#334155', true: '#7c3aed' }}
              />
            )}
          </View>

          {/* Device & SIM Diagnostics */}
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
              <Text style={[styles.infoVal, { color: '#10b981' }]}>
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
        </View>

        {/* Send Instant SMS Composer */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>💬 Send SMS via Phone SIM</Text>
          <Text style={styles.sectionSubtitle}>
            Dispatches directly through your phone's carrier — 100% free with unlimited SMS packs.
          </Text>

          <Text style={styles.inputLabel}>Recipient Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+919876543210 or 10-digit number"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
            value={recipient}
            onChangeText={setRecipient}
          />

          <View style={styles.msgHeaderRow}>
            <Text style={styles.inputLabel}>Message Content</Text>
            <Text style={styles.charCounter}>
              {charCount} chars ({smsSegments} SMS {smsSegments > 1 ? 'parts' : 'part'})
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Type your alert, assignment reminder, or notice..."
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={4}
            value={message}
            onChangeText={setMessage}
          />

          <TouchableOpacity
            style={[styles.sendBtn, sendingInstant && styles.btnDisabled]}
            onPress={handleSendInstant}
            disabled={sendingInstant}
            activeOpacity={0.8}
          >
            {sendingInstant ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>
                {gatewayState.isActive ? '🚀 Send Directly via SIM' : '📤 Queue in Gateway'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Queue & History */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📋 SMS Dispatch History</Text>
            <TouchableOpacity onPress={fetchJobs}>
              <Text style={styles.refreshLink}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {loadingJobs && recentJobs.length === 0 ? (
            <ActivityIndicator color="#7c3aed" style={{ marginVertical: 20 }} />
          ) : recentJobs.length === 0 ? (
            <Text style={styles.emptyText}>No SMS jobs dispatched yet.</Text>
          ) : (
            <View style={styles.jobList}>
              {recentJobs.map((job) => (
                <View key={job.id} style={styles.jobItem}>
                  <View style={styles.jobTopRow}>
                    <Text style={styles.jobPhone}>📱 {job.recipientPhone}</Text>
                    <View style={[styles.jobBadge, { backgroundColor: `${getStatusColor(job.status)}20` }]}>
                      <Text style={[styles.jobBadgeText, { color: getStatusColor(job.status) }]}>
                        {job.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.jobMsg} numberOfLines={2}>{job.message}</Text>
                  <View style={styles.jobBottomRow}>
                    <Text style={styles.jobDate}>
                      {job.sentAt
                        ? `Sent: ${format(new Date(job.sentAt), 'MMM dd, HH:mm')}`
                        : `Scheduled: ${format(new Date(job.scheduledAt), 'MMM dd, HH:mm')}`}
                    </Text>
                    {job.error ? (
                      <Text style={styles.jobError} numberOfLines={1}>⚠️ {job.error}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 16, gap: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pillOnline: { backgroundColor: '#10b98120', borderColor: '#10b98150', borderWidth: 1 },
  pillOffline: { backgroundColor: '#64748b20', borderColor: '#64748b50', borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: '#10b981' },
  dotOffline: { backgroundColor: '#94a3b8' },
  pillText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#7c3aed20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: { fontSize: 22 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  cardSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 14 },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { alignItems: 'flex-start', flex: 1 },
  infoLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: '600' },
  infoVal: { fontSize: 13, color: '#f1f5f9', fontWeight: '600', marginTop: 3 },
  activityBox: {
    marginTop: 14,
    backgroundColor: '#0f172a80',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityLabel: { fontSize: 11, color: '#7c3aed', fontWeight: '700' },
  activityText: { fontSize: 12, color: '#cbd5e1', flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  sectionSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  refreshLink: { fontSize: 13, color: '#7c3aed', fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#cbd5e1', marginBottom: 6 },
  msgHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
  charCounter: { fontSize: 11, color: '#64748b' },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  sendBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  btnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center', marginVertical: 16 },
  jobList: { gap: 10 },
  jobItem: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#334155' },
  jobTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  jobPhone: { fontSize: 13, fontWeight: '700', color: '#f1f5f9' },
  jobBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  jobBadgeText: { fontSize: 10, fontWeight: '800' },
  jobMsg: { fontSize: 12, color: '#94a3b8', lineHeight: 17 },
  jobBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  jobDate: { fontSize: 11, color: '#64748b' },
  jobError: { fontSize: 11, color: '#ef4444', flex: 1, textAlign: 'right', marginLeft: 8 },
});
