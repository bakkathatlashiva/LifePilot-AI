import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import * as SplashScreen from 'expo-splash-screen';

// Silence upstream react-navigation ref warning with react-native-safe-area-context
LogBox.ignoreLogs([
  'Function components cannot be given refs',
  'Check the render method of `FrameSizeProvider`',
  'FrameSizeProvider',
  'SafeAreaProvider',
]);

SplashScreen.preventAutoHideAsync();

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppNavigator />
    </SafeAreaProvider>
  );
}
