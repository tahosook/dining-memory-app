import React from 'react';
import { Text, View } from 'react-native';
import { settingsStyles } from './settingsStyles';

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={settingsStyles.section}>
      <Text style={settingsStyles.sectionTitle}>{title}</Text>
      <View style={settingsStyles.card}>{children}</View>
    </View>
  );
}
