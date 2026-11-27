import React from 'react';
import { Text, View } from 'react-native';
import type { MealInputAssistModelDownloadProgress } from '../../../ai/mealInputAssist';
import { formatBytes, formatProgressPercentage } from './settingsFormatters';
import { settingsStyles } from './settingsStyles';

export function AiDownloadProgressCard({
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
    <View
      style={settingsStyles.downloadProgressCard}
      testID="meal-input-assist-model-download-progress"
    >
      <Text style={settingsStyles.downloadProgressTitle}>
        {progressPercentage
          ? `進捗の目安: ${progressPercentage}`
          : 'ダウンロードを準備しています...'}
      </Text>
      {progress ? (
        <>
          <View style={settingsStyles.progressTrack}>
            <View
              style={[
                settingsStyles.progressFill,
                { width: `${Math.round(progress.overallProgress * 100)}%` },
              ]}
            />
          </View>
          <Text style={settingsStyles.runtimeStatusMode}>
            完了ファイル: {progress.completedFiles} / {progress.totalFiles}
          </Text>
          {progress.currentFileSourceFileName ? (
            <Text style={settingsStyles.runtimeStatusMode}>
              現在: {progress.currentFileSourceFileName}
            </Text>
          ) : null}
          {currentFileProgressPercentage ? (
            <Text style={settingsStyles.runtimeStatusMode}>
              現在の file 進捗: {currentFileProgressPercentage}
            </Text>
          ) : null}
          {currentBytesWritten ? (
            <Text style={settingsStyles.runtimeStatusMode}>
              受信量: {currentBytesWritten}
              {currentBytesExpected ? ` / ${currentBytesExpected}` : ''}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
