import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray,
  },
  detailValue: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 22,
  },
});
