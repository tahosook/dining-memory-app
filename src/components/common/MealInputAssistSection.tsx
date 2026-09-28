import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  type MealInputAssistProgress,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
  type MealInputAssistTextSuggestion,
} from '../../ai/mealInputAssist';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';

const AI_ASSIST_STATUS_LABELS: Record<MealInputAssistStatus, string> = {
  idle: '未実行',
  running: '解析中',
  success: '成功',
  error: '失敗',
  disabled: '無効',
};

const DEFAULT_TEST_IDS = {
  section: 'ai-input-assist-section',
  status: 'ai-input-assist-status',
  button: 'ai-input-assist-button',
  progress: 'ai-input-assist-progress',
  noteDraftCard: 'ai-note-draft-card',
  noteDraftApplyButton: 'ai-note-draft-apply-button',
} as const;

export type MealInputAssistSectionVariant = 'dark' | 'light';

type MealInputAssistSectionTestIDKey = keyof typeof DEFAULT_TEST_IDS;

export type MealInputAssistSectionTestIDs = Partial<
  Record<MealInputAssistSectionTestIDKey, string>
>;

export interface MealInputAssistSectionProps {
  status: MealInputAssistStatus;
  suggestions: MealInputAssistSuggestions;
  errorMessage: string | null;
  progress: MealInputAssistProgress | null;
  disabledReason: string | null;
  onRequestSuggestions: () => Promise<void>;
  onApplyNoteDraftSuggestion: (suggestion: MealInputAssistTextSuggestion) => void;
  variant?: MealInputAssistSectionVariant;
  testIDs?: MealInputAssistSectionTestIDs;
}

function formatAiAssistDuration(durationMs: number | null | undefined) {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs) || durationMs < 0) {
    return null;
  }

  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  if (totalSeconds < 60) {
    return `${totalSeconds}秒`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分`;
}

export const MealInputAssistSection: React.FC<MealInputAssistSectionProps> = ({
  status,
  suggestions,
  errorMessage,
  progress,
  disabledReason,
  onRequestSuggestions,
  onApplyNoteDraftSuggestion,
  variant = 'dark',
  testIDs,
}) => {
  const resolvedTestIDs = { ...DEFAULT_TEST_IDS, ...testIDs };
  const isLight = variant === 'light';
  const noteDraft = suggestions.noteDraft;
  const hasAnySuggestions = Boolean(noteDraft);
  const actionDisabled = status === 'running' || status === 'disabled';
  const actionLabel =
    status === 'running' ? '解析中...' : status === 'error' ? 'もう一度作成する' : 'AIでメモを作成';
  const helperMessage =
    status === 'disabled'
      ? (disabledReason ?? 'この端末では AI 入力補助を利用できません。')
      : status === 'error'
        ? (errorMessage ?? 'メモ下書きを取得できませんでした。もう一度お試しください。')
        : status === 'running'
          ? (progress?.message ??
            '写真をもとにメモ下書きを整理しています。保存はいつでも行えます。')
          : status === 'success' && !hasAnySuggestions
            ? 'メモ下書きが見つかりませんでした。手入力のまま保存できます。'
            : '作成した下書きは、ボタンを押したときだけメモ欄へ追加されます。';
  const progressLabel =
    typeof progress?.progress === 'number' ? `${Math.round(progress.progress * 100)}%` : null;
  const elapsedLabel = formatAiAssistDuration(progress?.elapsedMs ?? null);
  const remainingLabel = formatAiAssistDuration(progress?.estimatedRemainingMs ?? null);
  const progressValue = Math.max(0, Math.min(progress?.progress ?? 0.08, 1));

  return (
    <View
      style={[styles.section, isLight ? styles.sectionLight : styles.sectionDark]}
      testID={resolvedTestIDs.section}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isLight ? styles.titleLight : styles.titleDark]}>
          AI入力補助
        </Text>
        <View
          style={[
            styles.statusBadge,
            isLight ? styles.statusBadgeLight : styles.statusBadgeDark,
            status === 'success' &&
              (isLight ? styles.statusBadgeSuccessLight : styles.statusBadgeSuccessDark),
            status === 'error' &&
              (isLight ? styles.statusBadgeErrorLight : styles.statusBadgeErrorDark),
            status === 'disabled' &&
              (isLight ? styles.statusBadgeDisabledLight : styles.statusBadgeDisabledDark),
          ]}
        >
          <Text
            style={[styles.statusText, isLight ? styles.statusTextLight : styles.statusTextDark]}
            testID={resolvedTestIDs.status}
          >
            {AI_ASSIST_STATUS_LABELS[status]}
          </Text>
        </View>
      </View>

      <Text style={[styles.helperText, isLight ? styles.helperTextLight : styles.helperTextDark]}>
        {helperMessage}
      </Text>

      {status === 'running' ? (
        <View
          style={[
            styles.progressCard,
            isLight ? styles.progressCardLight : styles.progressCardDark,
          ]}
          testID={resolvedTestIDs.progress}
        >
          <View
            style={[
              styles.progressTrack,
              isLight ? styles.progressTrackLight : styles.progressTrackDark,
            ]}
          >
            <View style={[styles.progressFill, { width: `${Math.round(progressValue * 100)}%` }]} />
          </View>
          {progressLabel ? (
            <Text
              style={[
                styles.progressMeta,
                isLight ? styles.progressMetaLight : styles.progressMetaDark,
              ]}
            >
              進捗の目安: {progressLabel}
            </Text>
          ) : null}
          {elapsedLabel ? (
            <Text
              style={[
                styles.progressMeta,
                isLight ? styles.progressMetaLight : styles.progressMetaDark,
              ]}
            >
              経過: {elapsedLabel}
            </Text>
          ) : null}
          {remainingLabel ? (
            <Text
              style={[
                styles.progressMeta,
                isLight ? styles.progressMetaLight : styles.progressMetaDark,
              ]}
            >
              残り目安: 約{remainingLabel}
            </Text>
          ) : null}
          <Text
            style={[
              styles.progressHint,
              isLight ? styles.progressHintLight : styles.progressHintDark,
            ]}
          >
            保存は待たずに行えます。初回の model 読み込みは長めです。
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, actionDisabled && styles.buttonDisabled]}
        onPress={onRequestSuggestions}
        disabled={actionDisabled}
        testID={resolvedTestIDs.button}
      >
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </TouchableOpacity>

      {noteDraft ? (
        <View
          style={[
            styles.noteDraftCard,
            isLight ? styles.noteDraftCardLight : styles.noteDraftCardDark,
          ]}
          testID={resolvedTestIDs.noteDraftCard}
        >
          <Text
            style={[
              styles.noteDraftText,
              isLight ? styles.noteDraftTextLight : styles.noteDraftTextDark,
            ]}
          >
            {noteDraft.value}
          </Text>
          <TouchableOpacity
            style={[
              styles.noteDraftButton,
              isLight ? styles.noteDraftButtonLight : styles.noteDraftButtonDark,
            ]}
            onPress={() => onApplyNoteDraftSuggestion(noteDraft)}
            testID={resolvedTestIDs.noteDraftApplyButton}
          >
            <Text
              style={[
                styles.noteDraftButtonText,
                isLight ? styles.noteDraftButtonTextLight : styles.noteDraftButtonTextDark,
              ]}
            >
              メモに追加
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
  },
  sectionDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionLight: {
    backgroundColor: '#f5f9ff',
    borderColor: '#cfe2ff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  titleDark: {
    color: Colors.white,
  },
  titleLight: {
    color: Colors.text,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeDark: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  statusBadgeLight: {
    backgroundColor: '#e6eef8',
  },
  statusBadgeSuccessDark: {
    backgroundColor: 'rgba(40,167,69,0.24)',
  },
  statusBadgeSuccessLight: {
    backgroundColor: '#dff4e5',
  },
  statusBadgeErrorDark: {
    backgroundColor: 'rgba(220,53,69,0.24)',
  },
  statusBadgeErrorLight: {
    backgroundColor: '#fde8ea',
  },
  statusBadgeDisabledDark: {
    backgroundColor: 'rgba(108,117,125,0.3)',
  },
  statusBadgeDisabledLight: {
    backgroundColor: '#e9ecef',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextDark: {
    color: Colors.white,
  },
  statusTextLight: {
    color: Colors.text,
  },
  helperText: {
    ...GlobalStyles.body,
    lineHeight: 20,
  },
  helperTextDark: {
    color: '#d7dce1',
  },
  helperTextLight: {
    color: Colors.darkGray,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#5076a1',
  },
  buttonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  progressCard: {
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  progressCardDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressCardLight: {
    backgroundColor: Colors.white,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressTrackDark: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressTrackLight: {
    backgroundColor: '#d9e7f5',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.info,
  },
  progressMeta: {
    fontSize: 13,
  },
  progressMetaDark: {
    color: Colors.white,
  },
  progressMetaLight: {
    color: Colors.text,
  },
  progressHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  progressHintDark: {
    color: '#c7d4dd',
  },
  progressHintLight: {
    color: Colors.gray,
  },
  noteDraftCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  noteDraftCardDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  noteDraftCardLight: {
    backgroundColor: Colors.white,
    borderColor: '#d9e7f5',
  },
  noteDraftText: {
    fontSize: 14,
    lineHeight: 20,
  },
  noteDraftTextDark: {
    color: Colors.white,
  },
  noteDraftTextLight: {
    color: Colors.text,
  },
  noteDraftButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noteDraftButtonDark: {
    backgroundColor: Colors.white,
  },
  noteDraftButtonLight: {
    backgroundColor: Colors.primary,
  },
  noteDraftButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  noteDraftButtonTextDark: {
    color: Colors.primary,
  },
  noteDraftButtonTextLight: {
    color: Colors.white,
  },
});
