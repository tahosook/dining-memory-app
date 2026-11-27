import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { checkAndApplyOtaUpdate } from '../../utils/buildInfo';

/**
 * Manages manual EAS OTA update checks in SettingsScreen.
 */
export function useSettingsOtaUpdate() {
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkAndApplyOtaUpdate();
      if (result.status === 'error') {
        Alert.alert('更新確認エラー', result.error || '更新の確認中にエラーが発生しました。');
      } else if (result.status === 'applied') {
        Alert.alert('更新完了', '新しいアップデートを適用しました。');
      } else if (result.status === 'no_update') {
        Alert.alert('最新の状態です', '利用可能なアップデートはありません。');
      } else if (result.status === 'disabled') {
        Alert.alert('確認不可', '開発環境またはスタンドアロンビルド外では更新を確認できません。');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '更新の確認中にエラーが発生しました。';
      Alert.alert('更新確認エラー', message);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  return {
    checkingUpdate,
    handleCheckUpdate,
  };
}
