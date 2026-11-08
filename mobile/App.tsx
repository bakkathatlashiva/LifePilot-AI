import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import * as SplashScreen from 'expo-splash-screen';

// Silence upstream react-navigation ref warning with react-native-safe-area-context
LogBox.ignoreLogs([
  'Function components cannot be given refs',
  'Check the render method of `FrameSizeProvider`',
  'FrameSizeProvider',
  'SafeAreaProvider',
]);

// Safely instruct splash screen to stay until initial paint, catching unhandled rejections
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  useEffect(() => {
    // Hide native splash screen as soon as component mounts
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <AppNavigator />
    </SafeAreaProvider>
  );
}
