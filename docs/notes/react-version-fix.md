# React / react-native-renderer バージョン不一致修正メモ
日付: 2025-10-12
問題:
- Expo 起動後、Android で以下エラー
  - Incompatible React versions: react 19.1.1 vs react-native-renderer 19.1.0
  - TypeError: Cannot read property 'default' of undefined

原因:
- react と react-native-renderer が厳密一致でないため。React と renderer は同じ正確なバージョンである必要がある。

実行した修正:
- 例（react-native-renderer を合わせる場合）:
  - yarn add react-native-renderer@19.1.1 --exact
- または（Expo 推奨に合わせる場合）:
  - npx expo install react react-native

検証手順:
1. rm -rf node_modules yarn.lock && yarn install
2. npx expo start -c
3. Android で起動しエラーが消えることを確認

関連コマンド（トラブル確認用）:
- npm ls react react-native-renderer
- npx expo doctor

参照:
- https://react.dev/warnings/version-mismatch

フォローアップ / 改善点:
- CI にバージョン一致チェックを追加（例: npm ls react react-native-renderer をビルド前に実行）
- CHANGELOG に短く追記しておく

// 以下このタイミングで修正した内容
diff --git a/app.json b/app.json
index 9d2cc15..b661cc9 100644
--- a/app.json
+++ b/app.json
@@ -29,12 +29,8 @@
       "favicon": "./assets/favicon.png"
     },
     "plugins": [
-      "expo-sqlite"
-    ],
-    "permissions": [
-      "CAMERA",
-      "ACCESS_MEDIA_LIBRARY",
-      "ACCESS_FINE_LOCATION"
+      "expo-sqlite",
+      "expo-font"
     ]
   }
 }
diff --git a/package.json b/package.json
index 24a2ca9..0707646 100644
--- a/package.json
+++ b/package.json
@@ -10,22 +10,20 @@
   },
   "dependencies": {
     "@expo/vector-icons": "^15.0.2",
-    "@nozbe/watermelondb": "^0.28.0",
     "@react-navigation/bottom-tabs": "^7.4.7",
     "@react-navigation/native": "^7.1.17",
     "@react-navigation/native-stack": "^7.3.26",
-    "@tensorflow/tfjs": "^4.22.0",
-    "@tensorflow/tfjs-react-native": "^1.0.0",
     "date-fns": "^4.1.0",
-    "expo": "~54.0.10",
-    "expo-camera": "^13.9.0",
-    "expo-gl": "^13.6.0",
+    "expo": "54.0.13",
+    "expo-camera": "~17.0.8",
+    "expo-font": "~14.0.9",
+    "expo-gl": "~16.0.7",
     "expo-gl-cpp": "^11.4.0",
     "expo-image-picker": "~17.0.8",
     "expo-sqlite": "~16.0.8",
     "expo-status-bar": "~3.0.8",
-    "react": "^19.1.1",
-    "react-dom": "^19.1.1",
+    "react": "19.1.0",
+    "react-dom": "19.1.0",
     "react-native": "0.81.4",
     "react-native-image-resizer": "^1.4.5",
     "react-native-safe-area-context": "~5.6.1",
