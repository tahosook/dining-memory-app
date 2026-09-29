import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MealInputAssistModelDownloadProgress } from '../../../ai/mealInputAssist';
import { Colors } from '../../../constants/Colors';

function formatProgressPercentage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  return `${Math.round(value * 100)}%`;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadProgressCard({
  progress,
}: {
  progress: MealInputAssistModelDownloadProgress | null;
}) {
  const progressPercentage = formatProgressPercentage(progress?.overallProgress ?? null);
  const currentFileProgressPercentage = formatProgressPercentage(
    progress?.currentFileProgress ?? null
  );

  const currentBytesWritten = formatBytes(progress?.currentFileBytesWritten ?? null);
  const currentBytesExpected = formatBytes(progress?.currentFileBytesExpected ?? null);

  return (
    <View style={styles.downloadProgressCard} testID="meal-input-assist-download-progress">
      <Text style={styles.downloadProgressTitle}>
        {progressPercentage
          ? `進捗の目安: ${progressPercentage}`
          : 'ダウンロードを準備しています...'}
      </Text>
      {progress ? (
        <>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress.overallProgress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.runtimeStatusMode}>
            完了ファイル: {progress.completedFiles} / {progress.totalFiles}
          </Text>
          {progress.currentFileSourceFileName ? (
            <Text style={styles.runtimeStatusMode}>現在: {progress.currentFileSourceFileName}</Text>
          ) : null}
          {currentFileProgressPercentage ? (
            <Text style={styles.runtimeStatusMode}>
              現在の file 進捗: {currentFileProgressPercentage}
            </Text>
          ) : null}
          {currentBytesWritten ? (
            <Text style={styles.runtimeStatusMode}>
              受信量: {currentBytesWritten}
              {currentBytesExpected ? ` / ${currentBytesExpected}` : ''}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  downloadProgressCard: {
    backgroundColor: '#f5f8ff',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  downloadProgressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbe5f5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  runtimeStatusMode: {
    fontSize: 13,
    color: Colors.gray,
  },
});
