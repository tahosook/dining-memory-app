# React Native コーディング標準 - Dining Memory App

## 概要
Dining Memory Appの長期メンテナンス性とコード品質を維持するためのコーディング規約。
AI開発支援ツール（Cursor, GitHub Copilot, Claude.ai）がこの文書を参照することで、
一貫性のある高品質なコード生成が可能となる。

## 基本原則
- **単一責任の原則 (SRP)**: 各コンポーネント/関数/クラスは1つの責任のみ
- **簡潔さ**: 読みやすく、理解しやすいコード
- **一貫性**: プロジェクト内での統一された書き方
- **保守性**: 将来の変更・拡張を考慮した構造
- **パフォーマンス**: React Native特化の最適化
- **安全性**: TypeScriptの強みを活かした型安全
- **テスト容易性**: 依存性の注入と副作用の分離
- **プラットフォーム抽象化**: iOS/Android固有の処理を統一的なAPIで扱う

## 最も重要な原則（トッププライオリティ）
### 単一責任の原則
コンポーネントや関数は1つの役割のみを担う。これが守られない場合、メンテナンス性が急激に低下し、テストもリファクタリングも困難になる。

### プラットフォーム抽象化パターン
```typescript
// ✅ Good: Platform.selectを使用したプラットフォーム固有設定
const safeAreaEdges = Platform.select({
  ios: ['top', 'bottom'],
  android: ['top'],
  default: []
}) as ('top' | 'bottom')[];

const topBarMarginTop = Platform.select({
  ios: 0, // SafeArea handles this
  android: 24,
  default: 0
});
```

### Error Boundary実装
```typescript
// ✅ Good: ランタイムエラーハンドリング
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error:', error);
    // TODO: Send to error monitoring service
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error!, this.handleRetry);
      }

      return (
        <View style={styles.container}>
          <Text>エラーが発生しました</Text>
          <TouchableOpacity onPress={this.handleRetry}>
            <Text>再試行</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
```

### 定数管理とハードコーディング回避
```typescript
// ✅ Good: 定数として管理し変更箇所を一元化
const PERMISSION_TIMEOUT_MS = 10000;
const PHOTO_QUALITY = 0.8;

// Style constants
const CAMERA_BUTTON_SIZE = 80;
const FOCUS_AREA_RATIO = 0.8;

// API endpoints
const API_ENDPOINTS = {
  MEALS: '/meals',
  IMAGES: '/images',
} as const;

// Navigation route names
const ROUTE_NAMES = {
  CAMERA: 'Camera',
  RECORDS: 'Records',
  SETTINGS: 'Settings',
} as const;
```

### メモリ管理とライフサイクル
```typescript
// ✅ Good: useEffectのクリーンアップ
useEffect(() => {
  const cameraCurrent = cameraRef.current;
  return () => {
    if (cameraCurrent) {
      // カメラリソースのクリーンアップ
      console.log('Camera cleanup');
    }
  };
}, []);

// ✅ Good: EventListenerのクリーンアップ
useEffect(() => {
  const subscription = databaseSubscription.observe(callback);

  return () => {
    subscription.unsubscribe();  // メモリリーク防止
  };
}, [callback]);
```

### テスト容易性設計
```typescript
// ✅ Good: 依存性の注入でテスト容易性を向上
const useCameraLogic = (deps: {
  permissionHook: typeof useCameraPermissions;
  mediaLibrary: typeof MediaLibrary;
  navigation: Navigation;
}) => {
  const [permission, requestPermission] = deps.permissionHook();
  // ...
};

// ✅ Good: 副作用を分離した純粋関数
export const validateMealInput = (input: MealInput): ValidationResult => {
  // 副作用のない純粋関数
  return { isValid: true, errors: [] };
};

// ✅ Good: カスタムHookでロジックを分離
const useMealForm = () => {
  // UIロジックと副作用をここに集約
  // テスト時にMock可能に
};
```

## 1. プロジェクト構成

### ディレクトリ構造
```
src/
├── components/
│   ├── common/          # 汎用コンポーネント
│   ├── ui/             # UI専用コンポーネント
│   └── screens/        # スクリーン固有
├── screens/            # 画面コンポーネント
├── navigation/         # ナビゲーション設定
├── database/           # DB関連（モデル、サービス）
│   ├── models/         # Watermelon DBモデル
│   ├── services/       # DB操作サービス
│   └── migrations/     # DBマイグレーション
├── hooks/              # カスタムHooks
├── utils/              # ユーティリティ関数
├── constants/          # 定数定義
├── types/              # TypeScript型定義
└── contexts/           # React Context
```

### ファイル命名規則
- **コンポーネント**: `PascalCase` (例: MealCard.tsx)
- **Hooks**: `useCamelCase` (例: useCamera.ts)
- **ユーティリティ**: `camelCase` (例: dateFormatter.ts)
- **型定義**: `PascalCase` + `Types` (例: MealTypes.ts)
- **定数**: `SCREAMING_SNAKE_CASE` (例: SCREEN_NAMES.ts)

## 2. TypeScript 型定義規約

### 基本データ型
```typescript
// ✅ Good: 明確な型定義
interface Meal {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  tags: readonly string[];  // readonly推奨
}

// ❌ Bad: any使用、曖昧な型
interface Meal {
  id: any;
  name: string;
  description: string | null | undefined;  // 回避可能なら避ける
}
```

### ジェネリック型使用
```typescript
// ✅ Good: 再利用可能な型
type ApiResponse<T> = {
  data: T;
  error?: string;
  loading: boolean;
};

// 使用例
type MealResponse = ApiResponse<Meal>;
type MealListResponse = ApiResponse<Meal[]>;
```

### 共用体型（Union Types）の推奨
```typescript
// ✅ Good: 安全な共用体型
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// 使用例
const mealType: MealType = 'lunch';  // 型安全
```

### Nullable型の扱い
```typescript
// ✅ Good: Optional chaining + nullish coalescing
const mealName = meal?.name ?? '不明';

// ✅ Good: 早期リターン
if (!meal) return null;
```

## 3. React コンポーネント規約

### 関数コンポーネントの書き方
```typescript
// ✅ Good: Arrow function + 型定義
interface MealCardProps {
  meal: Meal;
  onPress?: () => void;
}

export const MealCard: React.FC<MealCardProps> = ({
  meal,
  onPress
}) => {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text>{meal.name}</Text>
    </TouchableOpacity>
  );
};
```

### Hooks使用原則
```typescript
// ✅ Good: カスタムHookでのロジック分離
const useMealList = () => {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMeals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mealService.getAll();
      setMeals(data);
    } finally {
      setLoading(false);
    }
  }, []);

  return { meals, loading, loadMeals };
};
```

### イベントハンドラー命名
```typescript
// ✅ Good: handle + イベント名
const handlePress = () => console.log('Pressed');
const handleSubmit = () => console.log('Submitted');

// ❌ Bad: on + イベント名 (混乱しやすい)
const onPress = () => console.log('Pressed');
```

### Propsの構造化
```typescript
// ✅ Good: 構造化代入
const MealList = ({ meals, loading, onMealPress }: MealListProps) => {
  // ...
};
```

### Memo化の原則
```typescript
// ✅ Good: 必要な場合のみメモ化
const ExpensiveComponent = React.memo(({ data }: Props) => {
  // 重い計算を含むコンポーネント
  return <View>{/* heavy rendering */}</View>;
});

// ✅ Good: useCallbackで不必要な再レンダー防止
const handlePress = useCallback(() => {
  // イベント処理
}, []);  // 依存配列は最小限に
```

## 4. スタイル定義規約

### StyleSheet使用原則
```typescript
// ✅ Good: StyleSheetオブジェクト化
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

// ❌ Bad: インラインスタイル
<View style={{ flex: 1, padding: 16 }}>
  <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
```

### スタイル定数管理
```typescript
// constants/Colors.ts
export const Colors = {
  primary: '#007AFF',
  secondary: '#6c757d',
  background: '#f8f9fa',
  text: '#212529',
} as const;

// constants/Styles.ts
export const GlobalStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: 16,
  },
});
```

### レスポンシブ対応
```typescript
// ✅ Good: Dimensions + useWindowDimensions
import { useWindowDimensions } from 'react-native';

const { width } = useWindowDimensions();

const styles = StyleSheet.create({
  card: {
    width: width * 0.9,  // 画面幅の90%
  },
});
```

## 5. 非同期処理規約

### Async/Await原則
```typescript
// ✅ Good: Async/await使用
const loadData = async () => {
  try {
    setLoading(true);
    const data = await fetchMeals();
    setMeals(data);
  } catch (error) {
    console.error('Failed to load meals:', error);
    setError(error.message);
  } finally {
    setLoading(false);
  }
};

// ❌ Bad: Promiseチェーン (読みにくい)
const loadData = () => {
  setLoading(true);
  fetchMeals()
    .then(data => setMeals(data))
    .catch(error => setError(error.message))
    .finally(() => setLoading(false));
};
```

### Error Boundary使用
```typescript
// ✅ Good: エラーバウンダリ実装
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

## 6. データベース操作規約

### WatermelonDBモデル定義
```typescript
// ✅ Good: 明確な型定義
import { Model } from '@nozbe/watermelondb';

export class Meal extends Model {
  static table = 'meals';

  @field('name') name!: string;
  @field('description') description?: string;
  @date('created_at') createdAt!: Date;

  @children('ingredients') ingredients!: Ingredient[];
}

// ✅ Good: サービスクラスでの操作まとめる
export class MealService {
  static async create(mealData: MealInput): Promise<Meal> {
    return await database.write(async () => {
      return await database.get<Meal>('meals').create(meal => {
        Object.assign(meal, mealData);
      });
    });
  }
}
```

### データベース観測
```typescript
// ✅ Good: Observableパターン
import { Q } from '@nozbe/watermelondb';

const useMeals = () => {
  const [meals, setMeals] = useState<Meal[]>([]);

  useEffect(() => {
    const subscription = database
      .get<Meal>('meals')
      .query(Q.where('is_deleted', false))
      .observe()
      .subscribe(setMeals);

    return () => subscription.unsubscribe();
  }, []);

  return meals;
};
```

## 7. テスト規約

### コンポーネントテスト
```typescript
// ✅ Good: React Native Testing Library使用
import { render, fireEvent } from '@testing-library/react-native';

describe('MealCard', () => {
  it('renders meal name', () => {
    const mockMeal = { id: '1', name: 'Test Meal' };
    const { getByText } = render(<MealCard meal={mockMeal} />);

    expect(getByText('Test Meal')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const mockOnPress = jest.fn();
    const { getByTestId } = render(
      <MealCard meal={mockMeal} onPress={mockOnPress} />
    );

    fireEvent.press(getByTestId('meal-card'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});
```

### Hooksテスト
```typescript
// ✅ Good: @testing-library/react-hooks使用
import { renderHook, act } from '@testing-library/react-hooks';

describe('useMeals', () => {
  it('loads meals successfully', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useMeals());

    act(() => {
      result.current.loadMeals();
    });

    await waitForNextUpdate();

    expect(result.current.meals).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });
});
```

## 8. パフォーマンス最適化規約

### リストレンダリング
```typescript
// ✅ Good: FlatList + memoization
const MealItem = React.memo(({ meal, onPress }: MealItemProps) => (
  <TouchableOpacity onPress={onPress}>
    <Text>{meal.name}</Text>
  </TouchableOpacity>
));

const MealList = ({ meals }: MealListProps) => (
  <FlatList
    data={meals}
    renderItem={({ item }) => (
      <MealItem meal={item} onPress={() => handlePress(item)} />
    )}
    keyExtractor={item => item.id}
    // 仮想化によるパフォーマンス向上
    initialNumToRender={10}
    maxToRenderPerBatch={5}
    windowSize={5}
  />
);
```

### 画像最適化
```typescript
// ✅ Good: 適切な画像サイズ指定
import FastImage from 'react-native-fast-image';

const MealImage = ({ meal }: { meal: Meal }) => (
  <FastImage
    source={{ uri: meal.thumbnailUrl }}
    style={{ width: 100, height: 100 }}
    resizeMode={FastImage.resizeMode.cover}
    // キャッシュ設定
    cache={FastImage.cacheControl.immutable}
  />
);
```

### Bundle Split原則
```typescript
// ✅ Good: 遅延読み込み
const SearchScreen = lazy(() => import('../screens/SearchScreen'));

// ✅ Good: ルートレベルでの分割
const AppNavigator = () => (
  <NavigationContainer>
    <Tab.Navigator>
      <Tab.Screen name="Camera" component={CameraScreen} />
      <Tab.Screen name="Search">
        {() => (
          <Suspense fallback={<LoadingSpinner />}>
            <SearchScreen />
          </Suspense>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  </NavigationContainer>
);
```

## 9. エラー処理・ログ規約

### 統一エラーハンドリング
```typescript
// ✅ Good: カスタムエラークラス
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ✅ Good: エラーハンドリングHook
const useErrorHandler = () => {
  const [error, setError] = useState<AppError | null>(null);

  const handleError = useCallback((error: unknown) => {
    console.error('Error occurred:', error);

    if (error instanceof AppError) {
      setError(error);
    } else {
      setError(new AppError(
        '予期しないエラーが発生しました',
        'UNKNOWN_ERROR',
        error
      ));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { error, handleError, clearError };
};
```

## 10. ドキュメント規約

### コンポーネントドキュメント
```typescript
/**
 * 食事記録カードコンポーネント
 *
 * @param meal - 表示する食事データ
 * @param onPress - タップ時のコールバック関数
 * @returns JSX.Element
 *
 * @example
 * ```tsx
 * <MealCard
 *   meal={mealData}
 *   onPress={() => navigation.navigate('Detail', { id: mealData.id })}
 * />
 * ```
 */
interface MealCardProps {
  meal: Meal;
  onPress?: () => void;
}
```

### コードコメント原則
```typescript
// ✅ Good: なぜを説明するコメント
// AI解析結果が不十分な場合、クラウドAIにフォールバック
if (confidence < 0.8) {
  return await callCloudAI();
}

// ❌ Bad: 何をしているかを説明するコメント
// confidenceをチェック
if (confidence < 0.8) { ... }
```

## 11. Git 運用規約

### コミットメッセージ
```bash
# ✅ Good: 意味のあるコミットメッセージ
feat: Add meal search functionality
fix: Resolve camera permission issue on iOS
refactor: Extract meal validation logic to separate hook
docs: Update API documentation

# ❌ Bad: 無意味なコミットメッセージ
update
fix bug
changes
```

### ブランチ命名
```bash
# ✅ Good: 機能ベースの命名
feature/add-meal-search
fix/camera-permission-issue
refactor/extract-validation-hook

# ❌ Bad: 曖昧な命名
new-feature
fix-bug
update-code
```

## 12. 継続的改善

### Lint・Formatツール使用
```json
// .eslintrc.js
module.exports = {
  extends: ['@react-native-community', 'prettier'],
  rules: {
    // カスタムルール
    '@typescript-eslint/no-unused-vars': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};

// .prettierrc.js
module.exports = {
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  tabWidth: 2,
};
```

### 定期レビューポイント
- **コードレビューのたび**: 新しいパターンの適合性確認
- **スプリント終了時**: 規約の見直し・更新
- **バージョンアップ時**: 新技術への対応確認
- **チームメンバーの変更時**: 規約の共有・教育

---

## 規約コンプライアンスチェックリスト

新規コード作成時:
- [ ] **単一責任の原則**を守っている（1つの役割のみ）
- [ ] **プラットフォーム抽象化**を行っている（iOS/Android固有コードはPlatform.select使用）
- [ ] **Error Boundary**が適切に配置されている
- [ ] 定数管理が徹底されている（ハードコーディングを避ける）
- [ ] メモリ管理が適切（useEffectクリーンアップ、イベントリスナー解放）
- [ ] テスト容易性を考慮した設計（依存性の注入、副作用の分離）
- [ ] TypeScriptの型が適切に定義されている
- [ ] コンポーネントは適切なPropsインターフェースを持つ
- [ ] 非同期処理に適切なエラーハンドリングがある
- [ ] スタイルはStyleSheetオブジェクト化されている
- [ ] ハードコーディングされた値は定数化されている
- [ ] アクセシビリティ属性が適切に設定されている
- [ ] 適切なドキュメントコメントがある
- [ ] パフォーマンス考慮（不必要な再レンダリング防止）

既存コード修正時:
- [ ] 上記新規コード作成チェックリスト全てを遵守
- [ ] 関連ファイルも同時に更新されている
- [ ] テストが追加・更新されている
- [ ] ドキュメントが更新されている

### トッププライオリティチェックリスト（必須遵守）

コードレビューの必須チェックポイント:
- [ ] **SRP違反がないか** - 各関数/コンポーネントは1つの責任のみか
- [ ] **プラットフォーム固有コードの抽象化** - Platform.selectが使用されているか
- [ ] **エラーハンドリング** - Error Boundaryと適切なtry/catchがあるか
- [ ] **メモリリーク防止** - useEffectクリーンアップと unsubscribe処理があるか
- [ ] **定数管理** - マジックナンバーやハードコーディングがないか
- [ ] **テスト容易性** - 副作用が分離されMock可能か

この規約はプロジェクトの成長とともに継続的に改善されるものとする。
