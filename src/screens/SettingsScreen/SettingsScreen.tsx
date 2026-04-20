import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MealService } from '../../database/services/MealService';
import { Colors } from '../../constants/Colors';
import { AppSettingsService } from '../../database/services/AppSettingsService';
import { getLocalAiRuntimeStatusSnapshot, type LocalAiRuntimeStatusEntry, type LocalAiRuntimeStatusSnapshot } from '../../ai/runtime';

export default function SettingsScreen() {
  const [aiInputAssistEnabled, setAiInputAssistEnabled] = useState(false);
  const [aiInputAssistLoading, setAiInputAssistLoading] = useState(true);
  const [localAiRuntimeStatus, setLocalAiRuntimeStatus] = useState<LocalAiRuntimeStatusSnapshot | null>(null);
  const [localAiRuntimeStatusLoading, setLocalAiRuntimeStatusLoading] = useState(true);

  const loadAiInputAssistSetting = useCallback(async () => {
    setAiInputAssistLoading(true);

    try {
      const nextEnabled = await AppSettingsService.getAiInputAssistEnabled();
      setAiInputAssistEnabled(nextEnabled);
    } catch (error) {
      console.error('Failed to load AI input assist setting:', error);
      setAiInputAssistEnabled(false);
    } finally {
      setAiInputAssistLoading(false);
    }
  }, []);

  const loadLocalAiRuntimeStatus = useCallback(async () => {
    setLocalAiRuntimeStatusLoading(true);

    try {
      const snapshot = await getLocalAiRuntimeStatusSnapshot();
      setLocalAiRuntimeStatus(snapshot);
    } catch (error) {
      console.error('Failed to load local AI runtime status:', error);
      setLocalAiRuntimeStatus(null);
    } finally {
      setLocalAiRuntimeStatusLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAiInputAssistSetting().catch(() => undefined);
      loadLocalAiRuntimeStatus().catch(() => undefined);
    }, [loadAiInputAssistSetting, loadLocalAiRuntimeStatus])
  );

  const handleAiInputAssistToggle = useCallback(async (nextValue: boolean) => {
    setAiInputAssistEnabled(nextValue);

    try {
      await AppSettingsService.setAiInputAssistEnabled(nextValue);
    } catch (error) {
      console.error('Failed to save AI input assist setting:', error);
      setAiInputAssistEnabled((current) => !current);
      Alert.alert('設定を保存できませんでした', 'AI入力補助の設定を保存できませんでした。もう一度お試しください。');
    }
  }, []);

  const handleDeleteAllData = useCallback(() => {
    Alert.alert('ローカルデータ削除', '端末内の食事記録をすべて削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await MealService.clearAllMeals();
          Alert.alert('削除完了', 'ローカルデータを削除しました。');
        },
      },
    ]);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="プライバシー">
        <Text style={styles.bodyText}>このアプリは、記録データを端末内に保存する前提で動作します。</Text>
        <Text style={styles.bodyText}>自動的な外部送信は行わず、Records 詳細からユーザーが明示的に開く共有シートだけを例外として扱います。</Text>
        <Text style={styles.bodyText}>AI 入力補助は設定でオンにした場合だけ扱い、現在の spike では外部送信を行いません。</Text>
        <Text style={styles.bodyText}>Android の写真は `Pictures / Dining Memory` の専用アルバムに保存し、将来バックアップ対象として扱いやすい前提を維持します。</Text>
      </Section>

      <Section title="AI入力補助">
        <View style={styles.settingRow}>
          <View style={styles.settingTextBlock}>
            <Text style={styles.settingTitle}>端末内 AI 入力補助を有効にする</Text>
            <Text style={styles.settingDescription}>
              review 画面で写真を端末内だけで解析し、料理名やジャンル候補を提案します。外部送信は行いません。
            </Text>
            <Text style={styles.settingHint}>
              下の runtime status で、ready / unavailable と必要な app-local file path を確認できます。
            </Text>
          </View>
          <Switch
            value={aiInputAssistEnabled}
            onValueChange={handleAiInputAssistToggle}
            disabled={aiInputAssistLoading}
            testID="ai-input-assist-toggle"
          />
        </View>
      </Section>

      <Section title="Local AI Runtime Status">
        <Text style={styles.bodyText}>
          この app は model を配布・ダウンロードしません。dev build / native build 上で、app-local の固定 path に必要な file がある場合だけ local runtime が ready になります。
        </Text>
        {localAiRuntimeStatus ? (
          <>
            <RuntimeStatusCard
              title="セマンティック検索"
              entry={localAiRuntimeStatus.semanticSearch}
              testID="semantic-search-runtime-status"
            />
            <RuntimeStatusCard
              title="AI入力補助"
              entry={localAiRuntimeStatus.mealInputAssist}
              testID="meal-input-assist-runtime-status"
            />
          </>
        ) : localAiRuntimeStatusLoading ? (
          <Text style={styles.metaText} testID="local-ai-runtime-status-loading">local AI runtime status を確認しています...</Text>
        ) : (
          <Text style={styles.metaText} testID="local-ai-runtime-status-error">
            local AI runtime status を確認できませんでした。もう一度画面を開き直してください。
          </Text>
        )}
      </Section>

      <Section title="現在の機能範囲">
        <DisabledItem label="クラウドバックアップ" description="準備中" />
        <DisabledItem label="データエクスポート" description="準備中" />
        <DisabledItem label="復元機能" description="準備中" />
      </Section>

      <Section title="ローカルデータ">
        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAllData}>
          <Text style={styles.dangerButtonText}>ローカルデータを削除</Text>
        </TouchableOpacity>
      </Section>

      <Section title="アプリ情報">
        <Text style={styles.bodyText}>Dining Memory</Text>
        <Text style={styles.metaText}>Version 1.0.0</Text>
        <Text style={styles.metaText}>Offline-first MVP implementation</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function DisabledItem({ label, description }: { label: string; description: string }) {
  return (
    <View style={styles.disabledItem}>
      <Text style={styles.disabledLabel}>{label}</Text>
      <Text style={styles.disabledDescription}>{description}</Text>
    </View>
  );
}

function RuntimeStatusCard({
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
        <View style={[
          styles.runtimeStatusBadge,
          entry.kind === 'ready' ? styles.runtimeStatusBadgeReady : styles.runtimeStatusBadgeUnavailable,
        ]}
        >
          <Text style={styles.runtimeStatusBadgeText}>{entry.kind === 'ready' ? 'Ready' : 'Unavailable'}</Text>
        </View>
      </View>
      <Text style={styles.runtimeStatusReason}>{entry.reason}</Text>
      <Text style={styles.runtimeStatusMode}>Mode: {entry.mode}</Text>
      <Text style={styles.runtimeStatusPathsLabel}>Expected paths</Text>
      {entry.expectedPaths.map((path) => (
        <Text key={path} style={styles.runtimeStatusPath}>{path}</Text>
      ))}
    </View>
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
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
  metaText: {
    fontSize: 14,
    color: Colors.gray,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingTextBlock: {
    flex: 1,
    gap: 6,
  },
  settingTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  settingHint: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.gray,
  },
  disabledItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e1e1e1',
  },
  disabledLabel: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  disabledDescription: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 4,
  },
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
  dangerButton: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
