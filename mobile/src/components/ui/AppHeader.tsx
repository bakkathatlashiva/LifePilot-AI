import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onOpenDrawer?: () => void;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  onOpenDrawer,
  onBack,
  rightAction,
}: AppHeaderProps) {
  const { user } = useAuthStore();

  return (
    <View style={styles.header}>
      <View style={styles.leftRow}>
        {onBack ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        ) : onOpenDrawer ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenDrawer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.hamburger}>
              <View style={styles.hamLine} />
              <View style={styles.hamLine} />
              <View style={styles.hamLine} />
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.titleBox}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rightRow}>
        {rightAction ? (
          rightAction
        ) : user?.profilePicture ? (
          <Image
            source={{ uri: user.profilePicture }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '700',
  },
  hamburger: {
    gap: 4,
  },
  hamLine: {
    width: 16,
    height: 2,
    backgroundColor: colors.textSecondary,
    borderRadius: 1,
  },
  titleBox: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderPurple,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.borderPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 14,
  },
});

