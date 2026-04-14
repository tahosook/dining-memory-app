import { Alert, Linking } from 'react-native';

type OpenAppSettingsOptions = {
  errorLogLabel: string;
  alertMessage: string;
};

export async function openAppSettings(options: OpenAppSettingsOptions): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.error(`${options.errorLogLabel}:`, error);
    Alert.alert('設定を開けませんでした', options.alertMessage);
  }
}
