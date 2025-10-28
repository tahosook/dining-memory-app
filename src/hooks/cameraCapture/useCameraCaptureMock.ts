import { CameraCapturedPicture } from 'expo-camera';

/**
 * Webモードテスト用カメラキャプチャユーティリティ
 * 正常系のコードと完全に分離されたテスト専用モジュール
 *
 * このモジュールはExpo Webモードでカメラ権限が利用できない場合の
 * テスト目的でのみ使用するモック機能を提供します。
 */
export class CameraCaptureMock {
  /**
   * Webモードでのモック画像作成
   * 実際のカメラ撮影をシミュレートし、テスト用の画像データを生成
   */
  static createMockImage(): Promise<CameraCapturedPicture> {
    // Canvas APIが利用可能かチェック（Web環境専用）
    if (typeof document === 'undefined' || !document.createElement) {
      throw new Error('Mock image creation only available in web environment with Canvas API');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // モック画像の生成：背景を白くし、日時を表示
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';

    const timestamp = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    ctx.fillText(`テスト撮影: ${timestamp}`, canvas.width / 2, canvas.height / 2);

    // CanvasからData URLを生成（Base64エンコードされたJPEG）
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    return Promise.resolve({
      uri: dataUrl,
      width: canvas.width,
      height: canvas.height,
      format: 'jpg',
    });
  }

  /**
   * Webモードでの撮影成功メッセージ生成
   * テスト検証用の標準化されたメッセージを返す
   */
  static generateSuccessMessage(photo: CameraCapturedPicture): string {
    const timestamp = new Date().toLocaleString();

    return `✅ 写真を写真ライブラリに保存しました！

📸 写真詳細:
• ${photo.width}x${photo.height}
• 保存時刻: ${timestamp}

・記録タブで確認`;
  }
}
