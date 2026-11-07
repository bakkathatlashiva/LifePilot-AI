import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

export function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoEmoji}>⚡</Text>
      </View>
      <ActivityIndicator color="#7c3aed" size="large" style={styles.spinner} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  logoCircle: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
  },
  logoEmoji: { fontSize: 32 },
  spinner: { marginTop: 16 },
  label: { color: '#64748b', fontSize: 14, fontWeight: '500' },
});
