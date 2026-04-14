import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MealService } from '../../database/services/MealService';
import { Colors } from '../../constants/Colors';

export default function SettingsScreen() {
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
        <Text style={styles.bodyText}>外部送信が必要な AI 解析、クラウドバックアップ、データエクスポートは現在の実装には含めていません。</Text>
        <Text style={styles.bodyText}>Android の写真は `Pictures / Dining Memory` の専用アルバムに保存し、将来バックアップ対象として扱いやすい前提を維持します。</Text>
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
