import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import api, { API_BASE_URL } from '../lib/api';
import { colors } from '../theme/colors';
import { useAuthStore } from '../store/authStore';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [prefs, setPrefs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSavedMsg, setPhoneSavedMsg] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await api.get('/preferences');
      if (res.data?.data) {
        setPrefs(res.data.data);
        if (res.data.data.phoneNumber) {
          setPhoneNumber(res.data.data.phoneNumber);
        }
      }
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPrefs();
  }, [fetchPrefs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPrefs();
  }, [fetchPrefs]);

  const updatePreference = async (updates: Record<string, any>) => {
    setPrefs((prev: any) => ({ ...prev, ...updates }));
    setSavingPrefs(true);
    try {
      await api.put('/preferences', updates);
    } catch {
      fetchPrefs();
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSavePhone = async () => {
    const cleanPhone = phoneNumber.trim();
    setSavingPhone(true);
    try {
      await api.put('/preferences', { phoneNumber: cleanPhone });
      setPhoneSavedMsg(true);
      setTimeout(() => setPhoneSavedMsg(false), 3000);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.message || 'Failed to update phone');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const returnTo = encodeURIComponent('lifepilot://auth/callback');
      const authUrl = `${API_BASE_URL}/auth/google/gmail?returnTo=${returnTo}`;
      await WebBrowser.openAuthSessionAsync(authUrl, 'lifepilot://auth/callback');
      fetchPrefs();
    } catch (err: any) {
      Alert.alert('Notice', err?.message || 'Failed to start authorization');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of LifePilot AI?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="Settings"
        subtitle="Account, Notifications & Preferences"
        onOpenDrawer={() => setDrawerOpen(true)}
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
        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            {user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || 'Student'}</Text>
              <Text style={styles.userEmail}>{user?.email || ''}</Text>
              <Badge variant="purple" size="sm" style={{ marginTop: 6 }}>
                Verified Student Account
              </Badge>
            </View>
          </View>
        </Card>

        {/* Connected Services */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Connected Services</Text>

          <View style={styles.serviceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceName}>Google Workspace</Text>
              <Text style={styles.serviceDesc}>
                Active single sign-on & profile synchronization
              </Text>
            </View>
            <Badge variant="success" size="sm">Connected</Badge>
          </View>

          <View style={styles.divider} />

          <View style={styles.serviceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceName}>Gmail Intel & Automated Alerts</Text>
              <Text style={styles.serviceDesc}>
                Read & send notifications via university Gmail
              </Text>
            </View>
            <Button
              size="sm"
              variant="outline"
              onPress={handleConnectGmail}
              style={{ minHeight: 36, paddingHorizontal: 12 }}
            >
              Authorize
            </Button>
          </View>
        </Card>

        {/* Notifications & Alert Preferences */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Alert & Notification Channels</Text>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Master Notifications</Text>
              <Text style={styles.toggleSub}>
                Enable all proactive reminders and deadline warnings
              </Text>
            </View>
            <Switch
              value={prefs?.notificationsEnabled ?? true}
              onValueChange={(val) => updatePreference({ notificationsEnabled: val })}
              trackColor={{ false: colors.input, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Android Push Notifications</Text>
              <Text style={styles.toggleSub}>
                Instant notifications on this phone when assignments open
              </Text>
            </View>
            <Switch
              value={prefs?.pushAndroidEnabled ?? true}
              onValueChange={(val) => updatePreference({ pushAndroidEnabled: val })}
              trackColor={{ false: colors.input, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Gmail Email Alerts</Text>
              <Text style={styles.toggleSub}>
                Send critical 24h & 12h deadline reminders to your inbox
              </Text>
            </View>
            <Switch
              value={prefs?.emailNotificationsEnabled ?? true}
              onValueChange={(val) => updatePreference({ emailNotificationsEnabled: val })}
              trackColor={{ false: colors.input, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>SMS Gateway Notifications</Text>
              <Text style={styles.toggleSub}>
                Dispatch SMS reminders via phone SIM card automatically
              </Text>
            </View>
            <Switch
              value={prefs?.smsNotificationsEnabled ?? true}
              onValueChange={(val) => updatePreference({ smsNotificationsEnabled: val })}
              trackColor={{ false: colors.input, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          {/* Phone Number Input */}
          <View style={{ marginTop: 12, gap: 8 }}>
            <Input
              label="Recipient Mobile Number for SMS Alerts"
              placeholder="+919550802806"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            <Button
              size="sm"
              variant="outline"
              onPress={handleSavePhone}
              loading={savingPhone}
            >
              {phoneSavedMsg ? '✓ Number Saved!' : 'Save Phone Number'}
            </Button>
          </View>
        </Card>

        {/* Sign Out Button */}
        <Button
          variant="danger"
          onPress={handleSignOut}
          style={{ minHeight: 46 }}
        >
          Sign Out of LifePilot AI
        </Button>
      </ScrollView>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Settings"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  profileCard: { padding: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.borderPurple,
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.borderPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: colors.primaryLight },
  userName: { fontSize: 16, fontWeight: '700', color: colors.text },
  userEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sectionCard: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  serviceName: { fontSize: 13, fontWeight: '600', color: colors.text },
  serviceDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', marginVertical: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  toggleSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
