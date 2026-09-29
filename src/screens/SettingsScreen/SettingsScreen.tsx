import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { AiInputAssistSection } from '../../components/screens/SettingsScreen/AiInputAssistSection';
import { MediaPipeDevSection } from '../../components/screens/SettingsScreen/MediaPipeDevSection';
import { DataManagementSection } from '../../components/screens/SettingsScreen/DataManagementSection';
import { AppInfoSection } from '../../components/screens/SettingsScreen/AppInfoSection';
import { PrivacySection } from '../../components/screens/SettingsScreen/PrivacySection';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PrivacySection />
      <AiInputAssistSection />
      <MediaPipeDevSection />
      <DataManagementSection />
      <AppInfoSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
});
