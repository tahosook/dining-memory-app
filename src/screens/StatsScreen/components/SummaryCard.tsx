import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/Colors';

export const SummaryCard = React.memo(function SummaryCardComponent({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  summaryCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.gray,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
});
