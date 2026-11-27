import React from 'react';
import { Text } from 'react-native';
import { SettingsSection } from './SettingsSection';
import { settingsStyles } from './settingsStyles';

export function PrivacySection() {
  return (
    <SettingsSection title="プライバシー">
      <Text style={settingsStyles.bodyText}>食事記録と写真は端末内中心で扱います。</Text>
      <Text style={settingsStyles.bodyText}>
        自動的な外部送信はしない設計です。Records
        詳細などからユーザーが明示的に共有した場合のみ、外部アプリに渡ります。
      </Text>
      <Text style={settingsStyles.bodyText}>
        AI入力補助は写真を外部送信しません。ただし、AI入力補助のモデルデータをダウンロードする時だけ外部通信が発生します。
      </Text>
    </SettingsSection>
  );
}
