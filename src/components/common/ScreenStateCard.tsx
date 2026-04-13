import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';

export type ScreenStateCardProps = {
  title: string;
  description: string;
  variant: 'loading' | 'error' | 'empty';
  actionLabel?: string;
  onAction?: () => void;
  testIDPrefix?: string;
};

export function ScreenStateCard({
  title,
  description,
  variant,
  actionLabel,
  onAction,
  testIDPrefix,
}: ScreenStateCardProps) {
  const hasAction = Boolean(actionLabel && onAction);

  return (
    <View style={[styles.card, variant === 'error' && styles.errorCard]} testID={testIDPrefix}>
      {variant === 'loading' ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {hasAction ? (
        <TouchableOpacity style={styles.actionButton} onPress={onAction} testID={testIDPrefix ? `${testIDPrefix}-action` : undefined}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: '#f0c5cb',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  actionText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
