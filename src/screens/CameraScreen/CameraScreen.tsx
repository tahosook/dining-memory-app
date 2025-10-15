import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, CameraCapturedPicture } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';
import { CAMERA_CONSTANTS, ROUTE_NAMES, PLATFORM_CONFIGS } from '../../constants/CameraConstants';

const { width: screenWidth } = Dimensions.get('window');

// Platform-specific configurations using centralized constants
const platformConfig = Platform.select(PLATFORM_CONFIGS) ?? PLATFORM_CONFIGS.default;
const safeAreaEdges = platformConfig.safeAreaEdges;
const topBarMarginTop = platformConfig.topBarMarginTop;
const bottomBarMarginBottom = platformConfig.bottomBarMarginBottom;

// Types
interface PhotoPaths {
  compressedPath: string;
  thumbnailPath: string;
}

// Components
interface TopBarProps {
  onClosePress: () => void;
  onFlipPress: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onClosePress, onFlipPress }) => (
  <View style={[styles.topBar, { marginTop: topBarMarginTop }]}>
    <TouchableOpacity
      style={styles.closeButton}
      onPress={onClosePress}
      testID="close-button"
      accessibilityLabel="撮影画面を閉じる"
      accessibilityHint="このボタンをタップすると撮影を終了します"
      accessibilityRole="button"
    >
      <Text style={styles.closeButtonText}>✕</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.flipButton}
      onPress={onFlipPress}
      accessibilityLabel="カメラを反転"
      accessibilityHint="フロントカメラとバックカメラを切り替えます"
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>🔄</Text>
    </TouchableOpacity>
  </View>
);

// Custom hooks
const useCameraPermission = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasRequested, setHasRequested] = useState(false);

  useEffect(() => {
    const requestPermissions = async () => {
      if (hasRequested || permission?.status === 'granted' || permission?.status === 'denied') {
        return;
      }

      try {
        console.log('Requesting camera permission...');
        const permissionResult = await requestPermission();

        if (!permissionResult.granted) {
          Alert.alert(
            'カメラ権限が必要です',
            '写真撮影するためにカメラへのアクセス権限を許可してください。',
            [
              { text: '設定を開く', style: 'default' },
              { text: 'キャンセル', style: 'cancel' }
            ]
          );
          return;
        }

        // Request media library permission
        await requestMediaLibraryPermission();

      } catch (error) {
        handlePermissionError(error);
      } finally {
        setHasRequested(true);
      }
    };

    const requestMediaLibraryPermission = async () => {
      try {
        await MediaLibrary.getPermissionsAsync();
      } catch (mediaError) {
        console.warn('Media library permission check failed (expected on some Expo Go versions):', mediaError);
      }
    };

    const handlePermissionError = (error: unknown) => {
      console.error('Permission request error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('camera')) {
        Alert.alert('カメラエラー', 'カメラの初期化に失敗しました。Expo Goを再起動するか、開発ビルドを使用してください。');
      } else if (errorMessage.includes('permission')) {
        Alert.alert('権限エラー', 'カメラ権限が拒否されました。アプリの設定から権限を許可してください。');
      } else {
        Alert.alert('エラー', `権限確認中にエラーが発生しました: ${errorMessage}`);
      }
    };

    if (!hasRequested && permission?.status !== 'granted' && permission?.status !== 'denied') {
      const timeoutId = setTimeout(() => {
        console.log('Permission request timed out, trying again...');
        requestPermissions();
      }, CAMERA_CONSTANTS.PERMISSION_TIMEOUT_MS);

      requestPermissions().finally(() => {
        clearTimeout(timeoutId);
        console.log('Permission request completed');
      });
    }
  }, [permission, requestPermission, hasRequested]);

  return permission;
};

import { ErrorBoundary } from '../../components/common/ErrorBoundary';

export default function CameraScreen() {
  const navigation = useNavigation();
  const cameraPermission = useCameraPermission();
  const cameraRef = useRef<CameraView>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  // Cleanup on unmount
  useEffect(() => {
    const cameraCurrent = cameraRef.current;
    return () => {
      if (cameraCurrent) {
        console.log('Pausing camera on unmount');
        // CameraView does not have direct pause method, but we can stop any ongoing processes
      }
    };
  }, []);

  // Photo utilities - removed unused photoPaths state variable
  const generatePhotoPaths = useCallback((timestamp: number): PhotoPaths => ({
    compressedPath: `meal_${timestamp}_compressed.jpg`,
    thumbnailPath: `meal_${timestamp}_thumbnail.jpg`
  }), []);

  const savePhotoToMediaLibrary = useCallback(async (photoUri: string) => {
    try {
      console.log('Saving photo to MediaLibrary...');
      await MediaLibrary.createAssetAsync(photoUri);
      console.log('✅ Successfully saved photo to user\'s photo gallery!');
      return true;
    } catch (mediaError: any) {
      console.warn('Media library save failed:', mediaError.message);
      return false;
    }
  }, []);

  const cleanupTempFile = useCallback(async (photoUri: string) => {
    try {
      await FileSystem.deleteAsync(photoUri);
      console.log('Temp file cleaned up');
    } catch (cleanupError: any) {
      console.warn('Cleanup failed:', cleanupError.message);
    }
  }, []);

  const navigateToRecords = useCallback(() => {
    // @ts-expect-error Navigation type inference issue
    navigation.navigate('Records');
  }, [navigation]);

  const showPhotoSuccessAlert = useCallback((photo: { width: number; height: number; uri: string }) => {
    Alert.alert(
      '写真撮影完了',
      `✅ 写真を写真ライブラリに保存しました！

📸 写真詳細:
• ${photo.width}x${photo.height}
• 保存時刻: ${new Date().toLocaleString()}`,
      [
        { text: 'OK', style: 'default' },
        {
          text: '記録タブで確認',
          style: 'default',
          onPress: navigateToRecords
        }
      ]
    );
  }, [navigateToRecords]);

  // UI Alert functions
  const showCloseConfirmDialog = useCallback(() => {
    Alert.alert('確認', '撮影を終了して記録タブに移動しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '撮影を終了しました',      onPress: navigateToRecords }
    ]);
  }, [navigateToRecords]);

  // Take photo
  const takePicture = useCallback(async () => {
    if (!cameraRef.current || takingPhoto) return;

    try {
      setTakingPhoto(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: CAMERA_CONSTANTS.PHOTO_QUALITY,
        skipProcessing: false,
      });

      if (!photo) throw new Error('写真の撮影に失敗しました');

      // Process image - create resized version and thumbnail
      console.log('Photo captured successfully:', photo.uri);
      console.log('Photo details:', { width: photo.width, height: photo.height });

      // Note: photoPaths is prepared for future image analysis feature
      // const timestamp = Date.now();
      // const paths = generatePhotoPaths(timestamp);
      // Future: setPhotoPaths(paths);

      // Save to media library - primary functionality for Expo Go
      const saveSuccess = await savePhotoToMediaLibrary(photo.uri);
      if (!saveSuccess) {
        await cleanupTempFile(photo.uri);
        throw new Error('写真の保存に失敗しました');
      }

      showPhotoSuccessAlert(photo);

    } catch (error) {
      console.error('写真撮影エラー:', error);
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      setTakingPhoto(false);
    }
  }, [cameraRef, takingPhoto, generatePhotoPaths, savePhotoToMediaLibrary, cleanupTempFile, showPhotoSuccessAlert]);

  // Toggle camera facing
  const toggleCameraFacing = useCallback(() => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  }, []);

  if (cameraPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>カメラ権限を確認中...</Text>
      </View>
    );
  }

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          カメラまたは写真ライブラリへのアクセス権限がありません。
        </Text>
        <Text style={styles.permissionSubText}>
          設定アプリから権限を許可してください。
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={safeAreaEdges}>
        {/* Camera View */}
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode="picture"
          ratio="16:9"
        />

        {/* Overlay UI */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <TopBar
            onClosePress={showCloseConfirmDialog}
            onFlipPress={toggleCameraFacing}
          />

          {/* Center Focus Area */}
          <View style={styles.focusArea}>
            <View style={styles.focusSquare} accessibilityLabel="撮影範囲">
              <Text style={styles.instructionText} accessibilityLabel="撮影ガイド">撮影範囲に料理を合わせてください</Text>
            </View>
          </View>

          {/* Bottom Controls */}
          <View style={[styles.bottomBar, { marginBottom: bottomBarMarginBottom }]}>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.captureButton, takingPhoto && styles.captureButtonDisabled]}
                onPress={takePicture}
                disabled={takingPhoto}
                testID="capture-button"
                accessibilityLabel="写真を撮る"
                accessibilityHint="カメラボタンをタップして料理の写真を撮影します"
                accessibilityRole="button"
                accessibilityState={{ disabled: takingPhoto }}
              >
                <View style={styles.captureButtonInner}>
                  {takingPhoto ? (
                    <Text style={styles.captureButtonText}>撮影中...</Text>
                  ) : (
                    <View style={styles.captureButtonCircle} />
                  )}
                </View>
              </TouchableOpacity>

              <Text style={styles.captureHint} accessibilityLabel="カメラ操作ガイド">
                ボタンをタップして撮影
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  permissionText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  permissionSubText: {
    ...GlobalStyles.body,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 50,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusSquare: {
    width: screenWidth * 0.8,
    height: screenWidth * 0.8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  bottomBar: {
    paddingBottom: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonGroup: {
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff4444',
    borderWidth: 3,
    borderColor: '#fff',
  },
  captureButtonText: {
    color: '#333',
    fontSize: 12,
    fontWeight: 'bold',
  },
  captureHint: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
  buttonText: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
});
