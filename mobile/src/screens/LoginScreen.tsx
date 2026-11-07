import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, SafeAreaView, TextInput, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/authStore';
import api, { API_BASE_URL } from '../lib/api';

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [showPairingInput, setShowPairingInput] = useState(false);
  const { setTokens, loadProfile } = useAuthStore();

  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Initiate Google OAuth with explicit mobile callback scheme
      const returnTo = encodeURIComponent('lifepilot://auth/callback');
      const authUrl = `${API_BASE_URL}/auth/google?returnTo=${returnTo}`;

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'lifepilot://auth/callback'
      );

      if (result.type === 'success' && result.url) {
        let code: string | null = null;
        let accessToken: string | null = null;
        let refreshToken: string | null = null;
        let error: string | null = null;

        try {
          const url = new URL(result.url);
          code = url.searchParams.get('code');
          accessToken = url.searchParams.get('accessToken');
          refreshToken = url.searchParams.get('refreshToken');
          error = url.searchParams.get('error') || url.searchParams.get('message');
        } catch {
          const queryPart = result.url.split('?')[1] || '';
          const params = new URLSearchParams(queryPart);
          code = params.get('code');
          accessToken = params.get('accessToken');
          refreshToken = params.get('refreshToken');
          error = params.get('error') || params.get('message');
        }

        // Handle OAuth rejection or error
        if (error) {
          const readableError =
            error === 'access_denied'
              ? 'Google sign-in was cancelled.'
              : error === 'auth_failed'
              ? 'Authentication failed on server. Please try signing in again.'
              : error;
          Alert.alert('Sign-In Error', readableError);
          return;
        }

        if (code) {
          // Secure one-time code exchange (tokens never traverse deep link URLs)
          const response = await api.post('/auth/exchange-code', { code });
          const tokenData = response.data?.data;

          if (tokenData?.accessToken && tokenData?.refreshToken) {
            await setTokens(tokenData.accessToken, tokenData.refreshToken);
            await loadProfile();
          } else {
            Alert.alert('Sign-In Error', 'Invalid response received from authentication server.');
          }
        } else if (accessToken && refreshToken) {
          // Backward-compatible token handling
          await setTokens(accessToken, refreshToken);
          await loadProfile();
        } else {
          Alert.alert('Sign-In Error', 'No authorization code or tokens received from server.');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User closed or dismissed browser session without completing
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to complete sign-in.';
      Alert.alert(
        'Google Login Notice',
        `${errorMsg}\n\nTip: You can also use the 6-digit Web Code to link your phone instantly without browser redirects.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePairWithWeb = async () => {
    if (!pairingCode.trim()) {
      Alert.alert('Required', 'Please enter the 6-digit code shown on your LifePilot Web dashboard.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/pair/consume', {
        code: pairingCode.trim(),
      });

      const tokenData = response.data?.data;
      if (tokenData?.accessToken && tokenData?.refreshToken) {
        await setTokens(tokenData.accessToken, tokenData.refreshToken);
        await loadProfile();
        Alert.alert('Connected', `Successfully linked to ${tokenData.user?.email || 'LifePilot'}!`);
      } else {
        Alert.alert('Pairing Error', 'Invalid response received from server.');
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to link with web code.';
      Alert.alert('Pairing Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Logo area */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>⚡</Text>
            </View>
            <Text style={styles.appName}>LifePilot AI</Text>
            <Text style={styles.tagline}>Your Intelligent Personal Assistant</Text>
          </View>

          {/* Features */}
          <View style={styles.featuresContainer}>
            {[
              { icon: '📚', text: 'Auto-detect ERP assignments' },
              { icon: '🤖', text: 'AI-powered email analysis' },
              { icon: '📱', text: 'Personal SIM SMS Gateway' },
              { icon: '📅', text: 'Study planner & exam tracker' },
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Primary Google Login button */}
          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.btnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#1f2937" size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Web Pairing Section */}
          {!showPairingInput ? (
            <TouchableOpacity
              style={styles.pairToggleBtn}
              onPress={() => setShowPairingInput(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.pairToggleText}>🔗 Link via 6-Digit Web Code</Text>
              <Text style={styles.pairToggleSubtext}>Open Web Dashboard → SMS Gateway → Generate Code</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.pairingBox}>
              <Text style={styles.pairingTitle}>Enter 6-Digit Web Code</Text>
              <Text style={styles.pairingDescription}>
                On your laptop browser, open LifePilot Web → click "Pair Phone Gateway" to get your 6-digit code.
              </Text>
              <TextInput
                style={styles.pairingInput}
                placeholder="123456"
                placeholderTextColor="#64748b"
                keyboardType="number-pad"
                maxLength={6}
                value={pairingCode}
                onChangeText={setPairingCode}
                autoFocus
              />
              <View style={styles.pairingActions}>
                <TouchableOpacity
                  style={[styles.pairSubmitBtn, loading && styles.btnDisabled]}
                  onPress={handlePairWithWeb}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.pairSubmitBtnText}>Link Device</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowPairingInput(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={styles.disclaimer}>
            Fast, secure single sign-on using Google OAuth 2.0 or Direct Device Pairing.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { paddingHorizontal: 24, paddingVertical: 32, justifyContent: 'center', gap: 20 },
  logoContainer: { alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20,
    elevation: 10,
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 28, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  featuresContainer: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1e293b', borderRadius: 12, padding: 12 },
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: 14, color: '#94a3b8', flex: 1 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.7 },
  googleIcon: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  pairToggleBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  pairToggleText: { fontSize: 15, fontWeight: '700', color: '#c4b5fd' },
  pairToggleSubtext: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  pairingBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#7c3aed50',
    padding: 16,
    gap: 12,
  },
  pairingTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  pairingDescription: { fontSize: 12, color: '#94a3b8', lineHeight: 18 },
  pairingInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7c3aed',
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    paddingVertical: 12,
  },
  pairingActions: { flexDirection: 'row', gap: 10 },
  pairSubmitBtn: {
    flex: 1,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairSubmitBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
  disclaimer: { fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 18 },
});
