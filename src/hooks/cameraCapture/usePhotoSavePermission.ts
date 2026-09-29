import { useCallback } from 'react';
import { Alert } from 'react-native';
import { openAppSettings } from '../../utils/openAppSettings';
import { ensureAndroidPhotoSavePermission } from './photoSavePermission';

export const usePhotoSavePermission = () => {
  const openPhotoSettings = useCallback(async () => {
    await openAppSettings({
      errorLogLabel: 'Open photo settings error',
      alertMessage: 'アプリの設定画面から写真の保存権限を許可してください。',
    });
  }, []);

  const promptForPhotoSavePermission = useCallback(() => {
    Alert.alert(
      '写真の保存権限が必要です',
      'Dining Memory アルバムへ写真を保存するには、アプリ設定で写真の保存権限を許可してください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '設定を開く',
          onPress: async () => {
            await openPhotoSettings();
          },
        },
      ]
    );
  }, [openPhotoSettings]);

  const ensurePhotoSavePermission = useCallback(async (): Promise<boolean> => {
    const hasPermission = await ensureAndroidPhotoSavePermission();
    if (hasPermission) {
      return true;
    }

    promptForPhotoSavePermission();
    return false;
  }, [promptForPhotoSavePermission]);

  return {
    ensurePhotoSavePermission,
  };
};
