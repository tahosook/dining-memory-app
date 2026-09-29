import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  getAndroidVersionCode,
  getAppVersion,
  getBuildDate,
  getBuildEnvironment,
  getExpoSdkVersion,
  getGitCommitHash,
  getIosBuildNumber,
} from '../../../utils/buildInfo';
import { Colors } from '../../../constants/Colors';
import { Section } from './Section';
import { BuildInfoRow } from './BuildInfoRow';

export function AppInfoSection() {
  return (
    <Section title="アプリ情報">
      <Text style={styles.bodyText}>Dining Memory</Text>
      <BuildInfoRow label="Version" value={getAppVersion()} />
      <BuildInfoRow label="Build" value={getAndroidVersionCode() ?? getIosBuildNumber()} />
      <BuildInfoRow label="Environment" value={getBuildEnvironment()} />
      <BuildInfoRow label="Commit" value={getGitCommitHash()} />
      <BuildInfoRow label="Built" value={getBuildDate()} />
      <BuildInfoRow label="Expo SDK" value={getExpoSdkVersion()} />
    </Section>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
});
