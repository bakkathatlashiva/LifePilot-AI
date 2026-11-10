import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'alt' | 'highlight';
}

export function Card({
  children,
  style,
  onClick,
  padding = 'md',
  variant = 'default',
}: CardProps) {
  const paddingMap = {
    none: 0,
    sm: 10,
    md: 14,
    lg: 18,
  };

  const variantStyles = {
    default: {
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    alt: {
      backgroundColor: colors.cardAlt,
      borderColor: colors.border,
    },
    highlight: {
      backgroundColor: colors.card,
      borderColor: colors.borderPurple,
    },
  };

  const cardStyle = [
    styles.card,
    variantStyles[variant],
    { padding: paddingMap[padding] },
    style,
  ];

  if (onClick) {
    return (
      <TouchableOpacity
        onPress={onClick}
        activeOpacity={0.8}
        style={cardStyle}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
