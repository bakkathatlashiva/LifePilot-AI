import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
  Image,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';

interface NavItem {
  name: string;
  label: string;
  icon: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: '🏠' },
  { name: 'Tasks', label: 'My Tasks', icon: '✅' },
  { name: 'ERP', label: 'ERP Assignments', icon: '📋' },
  { name: 'Gmail', label: 'Gmail Intel', icon: '📧' },
  { name: 'SMSGateway', label: 'SIM Gateway', icon: '📶' },
  { name: 'Study', label: 'Study Planner', icon: '📚' },
  { name: 'Exams', label: 'Exams & Tests', icon: '🎓' },
  { name: 'Calendar', label: 'Calendar', icon: '📅' },
  { name: 'AIAssistant', label: 'AI Assistant', icon: '✨' },
  { name: 'Notifications', label: 'Notifications', icon: '🔔' },
  { name: 'Settings', label: 'Settings & Profile', icon: '⚙️' },
];

interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoute: string;
  onNavigate: (routeName: string) => void;
}

export function AppDrawer({
  isOpen,
  onClose,
  currentRoute,
  onNavigate,
}: AppDrawerProps) {
  const { user, logout } = useAuthStore();

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Backdrop */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Slide-over Drawer Panel */}
        <SafeAreaView style={styles.drawer}>
          {/* Header branding */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Text style={styles.zapIcon}>⚡</Text>
              </View>
              <View>
                <Text style={styles.brandTitle}>LifePilot AI</Text>
                <Text style={styles.brandSubtitle}>Personal Assistant</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* User profile capsule */}
          <View style={styles.userCapsule}>
            {user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'Student'}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.email || ''}
              </Text>
            </View>
          </View>

          {/* Navigation Items */}
          <ScrollView
            style={styles.navList}
            contentContainerStyle={styles.navContent}
            showsVerticalScrollIndicator={false}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = currentRoute === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.navItem, isActive && styles.activeNavItem]}
                  onPress={() => {
                    onNavigate(item.name);
                    onClose();
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.itemIcon}>{item.icon}</Text>
                  <Text
                    style={[
                      styles.itemLabel,
                      isActive && styles.activeItemLabel,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer with Logout */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={async () => {
                onClose();
                await logout();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutIcon}>🚪</Text>
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  drawer: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: '#0f172a',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zapIcon: {
    fontSize: 18,
    color: '#ffffff',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  brandSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  closeIcon: {
    color: colors.textMuted,
    fontSize: 14,
  },
  userCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 14,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  userEmail: {
    fontSize: 11,
    color: colors.textMuted,
  },
  navList: {
    flex: 1,
    marginTop: 8,
  },
  navContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 44,
    gap: 12,
  },
  activeNavItem: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.borderPurple,
  },
  itemIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    flex: 1,
  },
  activeItemLabel: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 9999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    minHeight: 44,
  },
  logoutIcon: {
    fontSize: 16,
  },
  logoutText: {
    color: colors.redLight,
    fontSize: 13,
    fontWeight: '600',
  },
});

