import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type LocalAiRuntimeStatusEntry } from '../../../ai/runtime';
import { Colors } from '../../../constants/Colors';

export function RuntimeStatusCard({
  title,
  entry,
  testID,
}: {
  title: string;
  entry: LocalAiRuntimeStatusEntry;
  testID: string;
}) {
  return (
    <View style={styles.runtimeStatusCard} testID={testID}>
      <View style={styles.runtimeStatusHeader}>
        <Text style={styles.disabledLabel}>{title}</Text>
        <View
          style={[
            styles.runtimeStatusBadge,
            entry.kind === 'ready'
              ? styles.runtimeStatusBadgeReady
              : styles.runtimeStatusBadgeUnavailable,
          ]}
        >
          <Text style={styles.runtimeStatusBadgeText}>
            {entry.kind === 'ready' ? 'Ready' : 'Unavailable'}
          </Text>
        </View>
      </View>
      <Text style={styles.runtimeStatusReason}>{entry.reason}</Text>
      <Text style={styles.runtimeStatusMode}>Mode: {entry.mode}</Text>
      <Text style={styles.runtimeStatusPathsLabel}>Expected paths</Text>
      {entry.expectedPaths.map(path => (
        <Text key={path} style={styles.runtimeStatusPath}>
          {path}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  runtimeStatusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  runtimeStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  disabledLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  runtimeStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  runtimeStatusBadgeReady: {
    backgroundColor: '#dff4e4',
  },
  runtimeStatusBadgeUnavailable: {
    backgroundColor: '#fde5e5',
  },
  runtimeStatusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  runtimeStatusReason: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  runtimeStatusMode: {
    fontSize: 13,
    color: Colors.gray,
  },
  runtimeStatusPathsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },
  runtimeStatusPath: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.gray,
  },
});
