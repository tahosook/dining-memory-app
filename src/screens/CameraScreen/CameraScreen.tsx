import React, { useState, useRef, useEffect } from 'react';
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function CameraScreen() {
  const navigation = useNavigation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [photoPaths, setPhotoPaths] = useState<{
    compressedPath: string;
    thumbnailPath: string;
  }>({ compressedPath: '', thumbnailPath: '' });

  // Request permissions
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        console.log('Starting permission requests...');

        // Camera permission first
        console.log('Requesting camera permission...');
        const permissionResult = await requestCameraPermission();
        console.log('Camera permission result:', permissionResult);

        if (!permissionResult.granted) {
          console.log('Camera permission denied');
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

        // Media library permission (Expo Go may have compatibility issues)
        console.log('Requesting media library permission...');

        // Try media library permission but don't block on it
        try {
          console.log('Media library permission attempt...');
          const mediaPermission = await MediaLibrary.getPermissionsAsync();
          console.log('Media library permission result:', mediaPermission);
        } catch (mediaError) {
          console.warn('Media library permission check failed (expected on some Expo Go versions):', mediaError);
        }

      } catch (error) {
        console.error('Permission request error:', error);

        // More specific error handling for Expo Go
        if (error instanceof Error) {
          if (error.message.includes('camera')) {
            Alert.alert('カメラエラー', 'カメラの初期化に失敗しました。Expo Goを再起動するか、開発ビルドを使用してください。');
          } else if (error.message.includes('permission')) {
            Alert.alert('権限エラー', 'カメラ権限が拒否されました。アプリの設定から権限を許可してください。');
          } else {
            Alert.alert('エラー', `権限確認中にエラーが発生しました: ${error.message}`);
          }
        } else {
          Alert.alert('エラー', '権限確認中に予期しないエラーが発生しました。');
        }
      }
    };

    // Only request permissions if not already determined
    if (cameraPermission?.status !== 'granted' && cameraPermission?.status !== 'denied') {
      // Add timeout for Expo Go compatibility
      const timeoutId = setTimeout(() => {
        console.log('Permission request timed out, trying again...');
        requestPermissions();
      }, 10000); // 10 second timeout

      requestPermissions().finally(() => {
        clearTimeout(timeoutId);
        console.log('Permission request completed');
      });
    }

  }, [cameraPermission, requestCameraPermission]);

  // Take photo
  const takePicture = async () => {
    if (!cameraRef || takingPhoto) return;

    try {
      setTakingPhoto(true);

      const photo = await cameraRef.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo) throw new Error('写真の撮影に失敗しました');

      // Process image - create resized version and thumbnail
      console.log('Photo captured successfully:', photo.uri);
      console.log('Photo details:', { width: photo.width, height: photo.height });

      // Set photo paths for future image analysis
      const timestamp = Date.now();
      setPhotoPaths({
        compressedPath: `meal_${timestamp}_compressed.jpg`,
        thumbnailPath: `meal_${timestamp}_thumbnail.jpg`
      });

      // Save to media library - primary functionality for Expo Go
      try {
        console.log('Saving photo to MediaLibrary...');
        await MediaLibrary.createAssetAsync(photo.uri);
        console.log('✅ Successfully saved photo to user\'s photo gallery!');
      } catch (mediaError: any) {
        console.warn('Media library save failed:', mediaError.message);

        // Clean up temp file if MediaLibrary failed
        try {
          await FileSystem.deleteAsync(photo.uri);
          console.log('Temp file cleaned up');
        } catch (cleanupError: any) {
          console.warn('Cleanup failed:', cleanupError.message);
        }

        throw mediaError; // Re-throw to show error alert
      }

      // Show success alert
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
            onPress: () => {
              // @ts-ignore
              navigation.navigate('Records');
            }
          }
        ]
      );

    } catch (error) {
      console.error('写真撮影エラー:', error);
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      setTakingPhoto(false);
    }
  };

  // Navigate to analysis screen (placeholder)
  const navigateToAnalysis = (compressedPath: string, thumbnailPath: string) => {
    // TODO: Navigate to analysis/editing screen with captured image paths
    console.log('Analysis with:', { compressedPath, thumbnailPath });
  };

  // Toggle camera facing
  const toggleCameraFacing = () => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  };

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
    <View style={styles.container}>

      {/* Camera View */}
      <CameraView
        ref={ref => setCameraRef(ref)}
        style={styles.camera}
        facing={facing}
        mode="picture"
        ratio="16:9"
      />

      {/* Overlay UI */}
      <View style={styles.overlay}>

        {/* Top Bar - Add top safe area for devices with notches */}
        <View style={[styles.topBar, { marginTop: 44 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => Alert.alert('確認', '撮影を終了して記録タブに移動しますか？', [
              { text: 'キャンセル', style: 'cancel' },
              { text: '撮影を終了しました', onPress: () => {
                // @ts-ignore
                navigation.navigate('Records');
              }}
            ])}
            testID="close-button"
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.flipButton}
            onPress={toggleCameraFacing}
          >
            <Text style={styles.buttonText}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Center Focus Area */}
        <View style={styles.focusArea}>
          <View style={styles.focusSquare}>
            <Text style={styles.instructionText}>撮影範囲に料理を合わせてください</Text>
          </View>
        </View>

        {/* Bottom Controls - Add bottom safe area for home indicator */}
        <View style={[styles.bottomBar, { marginBottom: 34 }]}>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.captureButton, takingPhoto && styles.captureButtonDisabled]}
              onPress={takePicture}
              disabled={takingPhoto}
              testID="capture-button"
            >
              <View style={styles.captureButtonInner}>
                {takingPhoto ? (
                  <Text style={styles.captureButtonText}>撮影中...</Text>
                ) : (
                  <View style={styles.captureButtonCircle} />
                )}
              </View>
            </TouchableOpacity>

            <Text style={styles.captureHint}>
              ボタンをタップして撮影
            </Text>
          </View>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionText: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  permissionSubText: {
    color: '#ccc',
    fontSize: 14,
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
    color: '#fff',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});
