import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'ghost';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  style,
}: BadgeProps) {
  const variantConfig = {
    default: {
      bg: 'rgba(255, 255, 255, 0.08)',
      text: colors.textSecondary,
      border: 'rgba(255, 255, 255, 0.12)',
      dotColor: colors.textSecondary,
    },
    success: {
      bg: colors.emeraldMuted,
      text: colors.emeraldLight,
      border: 'rgba(16, 185, 129, 0.3)',
      dotColor: colors.emerald,
    },
    warning: {
      bg: colors.amberMuted,
      text: colors.amberLight,
      border: 'rgba(245, 158, 11, 0.3)',
      dotColor: colors.amber,
    },
    danger: {
      bg: colors.redMuted,
      text: colors.redLight,
      border: 'rgba(239, 68, 68, 0.3)',
      dotColor: colors.red,
    },
    info: {
      bg: colors.blueMuted,
      text: colors.blueLight,
      border: 'rgba(59, 130, 246, 0.3)',
      dotColor: colors.blue,
    },
    purple: {
      bg: colors.primaryMuted,
      text: colors.primaryLight,
      border: colors.borderPurple,
      dotColor: colors.primary,
    },
    ghost: {
      bg: 'transparent',
      text: colors.textMuted,
      border: 'transparent',
      dotColor: colors.textMuted,
    },
  };

  const conf = variantConfig[variant] || variantConfig.default;
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: conf.bg,
          borderColor: conf.border,
          paddingHorizontal: isSm ? 6 : 9,
          paddingVertical: isSm ? 2 : 3,
        },
        style,
      ]}
    >
      {dot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: conf.dotColor, width: isSm ? 4 : 5, height: isSm ? 4 : 5 },
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          {
            color: conf.text,
            fontSize: isSm ? 10 : 11,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 9999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    borderRadius: 9999,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
