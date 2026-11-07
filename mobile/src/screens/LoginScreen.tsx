import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, SafeAreaView, Linking
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001/api';

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { setTokens, loadProfile } = useAuthStore();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // Open Google OAuth in browser — backend redirects back with tokens
      // In production, use expo-auth-session with proper redirect URIs
      const authUrl = `${API_URL}/auth/google`;

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'lifepilot://auth/callback'
      );

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const accessToken = url.searchParams.get('accessToken');
        const refreshToken = url.searchParams.get('refreshToken');

        if (accessToken && refreshToken) {
          await setTokens(accessToken, refreshToken);
          await loadProfile();
        } else {
          Alert.alert('Login Error', 'Authentication failed. Please try again.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open login page. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
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
            { icon: '🔔', text: 'Smart deadline reminders' },
            { icon: '📅', text: 'Study planner & exam tracker' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Login button */}
        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.googleBtnDisabled]}
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

        <Text style={styles.disclaimer}>
          We only request minimum permissions. Your Google password is never stored.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 32 },
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
  featuresContainer: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1e293b', borderRadius: 12, padding: 12 },
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: 14, color: '#94a3b8', flex: 1 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  googleBtnDisabled: { opacity: 0.7 },
  googleIcon: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  disclaimer: { fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 18 },
});
