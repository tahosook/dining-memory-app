import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/Colors';
import {
  getAndroidVersionCode,
  getAppVersion,
  getBuildDate,
  getBuildEnvironment,
  getExpoSdkVersion,
  getGitCommitHash,
  getIosBuildNumber,
  getRuntimeVersion,
  getUpdateSummary,
  isUpdatesEnabled,
} from '../../../utils/buildInfo';
import { SettingsSection } from './SettingsSection';
import { settingsStyles } from './settingsStyles';

function BuildInfoRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) {
    return null;
  }
  return (
    <View style={localStyles.buildInfoRow}>
      <Text style={localStyles.buildInfoLabel}>{label}</Text>
      <Text style={localStyles.buildInfoValue}>{String(value)}</Text>
    </View>
  );
}

export function AppInfoSection({
  checkingUpdate,
  onCheckUpdate,
}: {
  checkingUpdate: boolean;
  onCheckUpdate: () => void;
}) {
  return (
    <SettingsSection title="アプリ情報">
      <Text style={settingsStyles.bodyText}>Dining Memory</Text>
      <BuildInfoRow label="Version" value={getAppVersion()} />
      <BuildInfoRow label="Build" value={getAndroidVersionCode() ?? getIosBuildNumber()} />
      <BuildInfoRow label="Environment" value={getBuildEnvironment()} />
      <BuildInfoRow label="Commit" value={getGitCommitHash()} />
      <BuildInfoRow label="Built" value={getBuildDate()} />
      <BuildInfoRow label="Expo SDK" value={getExpoSdkVersion()} />
      <BuildInfoRow label="Runtime Version" value={getRuntimeVersion()} />
      <BuildInfoRow label="Update" value={getUpdateSummary()} />
      {isUpdatesEnabled() ? (
        <TouchableOpacity
          style={[
            settingsStyles.secondaryButton,
            localStyles.checkUpdateButton,
            checkingUpdate && settingsStyles.actionButtonDisabled,
          ]}
          onPress={onCheckUpdate}
          disabled={checkingUpdate}
          testID="settings-check-update-button"
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={settingsStyles.secondaryButtonText}>アプリの更新を確認</Text>
          )}
        </TouchableOpacity>
      ) : null}
      <Text style={settingsStyles.metaText}>端末内保存を基本にした食事記録アプリ</Text>
    </SettingsSection>
  );
}

const localStyles = StyleSheet.create({
  checkUpdateButton: {
    marginTop: 8,
  },
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
