import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAuthStore } from '../store/authStore';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { ERPScreen } from '../screens/ERPScreen';
import { GmailScreen } from '../screens/GmailScreen';
import { ExamsScreen } from '../screens/ExamsScreen';
import { StudyPlannerScreen } from '../screens/StudyPlannerScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { AIAssistantScreen } from '../screens/AIAssistantScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SmsGatewayScreen } from '../screens/SmsGatewayScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PageLoader } from '../components/PageLoader';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: '🏠',
    ERP: '📋',
    Tasks: '✅',
    AIAssistant: '✨',
    SMSGateway: '📶',
  };
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.iconText, { opacity: focused ? 1 : 0.6 }]}>
        {icons[name] ?? '📱'}
      </Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: 'rgba(255, 255, 255, 0.08)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="ERP"
        component={ERPScreen}
        options={{ tabBarLabel: 'ERP' }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ tabBarLabel: 'Tasks' }}
      />
      <Tab.Screen
        name="AIAssistant"
        component={AIAssistantScreen}
        options={{ tabBarLabel: 'Assistant' }}
      />
      <Tab.Screen
        name="SMSGateway"
        component={SmsGatewayScreen}
        options={{ tabBarLabel: 'SIM Gateway' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotificationsAsync().catch(console.warn);
    }
  }, [isAuthenticated]);

  // Handle notification taps when app is in background/killed
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === 'NEW_ASSIGNMENT' && navigationRef.current) {
          navigationRef.current.navigate('ERP');
        } else if (data?.type === 'TASK' && navigationRef.current) {
          navigationRef.current.navigate('Tasks');
        }
      }
    );
    return () => Notifications.removeNotificationSubscription(sub);
  }, []);

  if (isLoading) return <PageLoader />;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Gmail" component={GmailScreen} />
            <Stack.Screen name="Exams" component={ExamsScreen} />
            <Stack.Screen name="Study" component={StudyPlannerScreen} />
            <Stack.Screen name="Calendar" component={CalendarScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="ERP" component={ERPScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="AIAssistant" component={AIAssistantScreen} />
            <Stack.Screen name="SMSGateway" component={SmsGatewayScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
});
