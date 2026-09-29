import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { Section } from './Section';

export function PrivacySection() {
  return (
    <Section title="プライバシー">
      <Text style={styles.bodyText}>食事記録と写真は端末内中心で扱います。</Text>
      <Text style={styles.bodyText}>
        自動的な外部送信はしない設計です。Records
        詳細などからユーザーが明示的に共有した場合のみ、外部アプリに渡ります。
      </Text>
      <Text style={styles.bodyText}>
        AI入力補助は写真を外部送信しません。ただし、AI入力補助のモデルデータをダウンロードする時だけ外部通信が発生します。
      </Text>
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
