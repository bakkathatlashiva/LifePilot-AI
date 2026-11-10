import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'emerald';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}: ButtonProps) {
  const variantStyles = {
    primary: {
      bg: colors.primary,
      text: '#ffffff',
      border: 'transparent',
    },
    secondary: {
      bg: 'rgba(255, 255, 255, 0.1)',
      text: colors.text,
      border: colors.border,
    },
    outline: {
      bg: 'transparent',
      text: colors.primaryLight,
      border: colors.borderPurple,
    },
    danger: {
      bg: colors.red,
      text: '#ffffff',
      border: 'transparent',
    },
    ghost: {
      bg: 'transparent',
      text: colors.textSecondary,
      border: 'transparent',
    },
    emerald: {
      bg: colors.emerald,
      text: '#ffffff',
      border: 'transparent',
    },
  };

  const sizeStyles = {
    sm: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      minHeight: 36,
      fontSize: 12,
    },
    md: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      minHeight: 44,
      fontSize: 14,
    },
    lg: {
      paddingVertical: 14,
      paddingHorizontal: 20,
      minHeight: 50,
      fontSize: 15,
    },
  };

  const vConf = variantStyles[variant] || variantStyles.primary;
  const sConf = sizeStyles[size] || sizeStyles.md;

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.button,
        {
          backgroundColor: vConf.bg,
          borderColor: vConf.border,
          borderWidth: vConf.border !== 'transparent' ? 1 : 0,
          paddingVertical: sConf.paddingVertical,
          paddingHorizontal: sConf.paddingHorizontal,
          minHeight: sConf.minHeight,
          opacity: isDisabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={vConf.text} />
      ) : (
        <View style={styles.content}>
          {leftIcon && <View style={styles.icon}>{leftIcon}</View>}
          <Text
            style={[
              styles.text,
              {
                color: vConf.text,
                fontSize: sConf.fontSize,
              },
              textStyle,
            ]}
          >
            {children}
          </Text>
          {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
