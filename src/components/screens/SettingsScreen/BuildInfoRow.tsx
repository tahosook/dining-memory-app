import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/Colors';

export function BuildInfoRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) {
    return null;
  }
  return (
    <View style={styles.buildInfoRow}>
      <Text style={styles.buildInfoLabel}>{label}</Text>
      <Text style={styles.buildInfoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  buildInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buildInfoLabel: {
    fontSize: 14,
    color: Colors.gray,
  },
  buildInfoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
});
