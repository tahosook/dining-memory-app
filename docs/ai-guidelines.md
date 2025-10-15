# AI 生成支援ガイドライン - Dining Memory App

## 概要

このガイドラインは、Cursor、GitHub Copilot、Claude.ai等のAI開発支援ツールが、
Dining Memory Appのコーディング規約（`coding-standards.md`）に基づいた一貫性のある高品質なコードを生成するための指針となる。

## 1. コード生成の基本原則

### 規約順守の義務化
AI生成コードは以下の規約を**無条件で遵守**すること：
- `docs/coding-standards.md`に記載された全ての規約
- `docs/tech-spec.md`に記載された技術仕様
- `docs/database-design.md`に記載されたデータベース設計

### 生成コードの品質基準
- **型安全性**: TypeScriptの強みを活かした完全な型定義
- **保守性**: 長期メンテナンスを考慮した構造化
- **パフォーマンス**: React Native最適化を考慮
- **一貫性**: 既存コードパターンとの整合性

## 2. コンポーネント生成ガイドライン

### 関数コンポーネントの標準テンプレート
```typescript
// ✅ AI生成推奨テンプレート
interface [ComponentName]Props {
  // 必須Props
  [prop]: [Type];
  // オプションProps
  [prop]?: [Type];
}

export const [ComponentName]: React.FC<[ComponentName]Props] = ({
  [prop],
  [prop]
}) => {
  // 状態管理 (必要最小限)
  const [state, setState] = useState<[Type]>(initialValue);

  // イベントハンドラー (handlePrefix使用)
  const handlePress = useCallback(() => {
    // 処理
  }, []);

  return (
    <View style={styles.container}>
      {/* 実装 */}
    </View>
  );
};

// StyleSheet定義
const styles = StyleSheet.create({
  container: {
    // スタイル定義
  },
});
```

### カスタムHook生成パターン
```typescript
// ✅ AI生成推奨テンプレート
interface UseMealDataReturn {
  meals: Meal[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useMealData = (): UseMealDataReturn => {
  // 状態管理
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ取得関数
  const fetchMeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await mealService.getAllMeals();
      setMeals(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to fetch meals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初期データ取得
  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  return {
    meals,
    loading,
    error,
    refetch: fetchMeals,
  };
};
```

## 3. データベース関連コード生成

### WatermelonDBモデル定義
```typescript
// ✅ AI生成推奨テンプレート
import { Model, field, date, text, readonly, children } from '@nozbe/watermelondb';

export class Meal extends Model {
  static table = 'meals';

  // 必須フィールド
  @field('uuid') uuid!: string;
  @field('meal_name') mealName!: string;
  @field('meal_type') mealType!: string;

  // オプショナルフィールド
  @text('notes') notes?: string;

  // 日付フィールド
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  // 関連データ
  @children('ingredients') ingredients!: Ingredient[];
}

// 関連クエリ用関数
export const mealQueries = {
  // 最新順取得
  getRecent: (database: Database, limit = 20) => {
    return database.get<Meal>('meals')
      .query(Q.where('is_deleted', false), Q.sortBy('created_at', Q.desc), Q.take(limit));
  },

  // 検索
  searchByName: (database: Database, keyword: string) => {
    return database.get<Meal>('meals')
      .query(Q.where('meal_name', Q.like(`%${keyword}%`)));
  },
};
```

### サービスクラス生成パターン
```typescript
// ✅ AI生成推奨テンプレート
export class MealService {
  // 作成
  static async create(mealData: Omit<MealInput, 'id'>): Promise<Meal> {
    return await database.write(async () => {
      return await database.get<Meal>('meals').create(meal => {
        Object.assign(meal, {
          ...mealData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
    });
  }

  // 一括取得
  static async getAll(): Promise<Meal[]> {
    return await database.get<Meal>('meals')
      .query(Q.where('is_deleted', false))
      .fetch();
  }

  // 更新
  static async update(id: string, updates: Partial<MealInput>): Promise<void> {
    await database.write(async () => {
      const meal = await database.get<Meal>('meals').find(id);
      await meal.update(mealRecord => {
        Object.assign(mealRecord, {
          ...updates,
          updatedAt: new Date(),
        });
      });
    });
  }

  // 論理削除
  static async softDelete(id: string): Promise<void> {
    await database.write(async () => {
      const meal = await database.get<Meal>('meals').find(id);
      await meal.update(mealRecord => {
        mealRecord.isDeleted = true;
        mealRecord.updatedAt = new Date();
      });
    });
  }
}
```

## 4. テストコード生成ガイドライン

### コンポーネントテスト生成
```typescript
// ✅ AI生成推奨テンプレート
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MealCard } from '../MealCard';

const mockMeal: Meal = {
  id: '1',
  name: 'テスト料理',
  createdAt: new Date('2025-01-01'),
  tags: ['和食'],
};

describe('MealCard', () => {
  it('renders meal information correctly', () => {
    const { getByText, getByTestId } = render(
      <MealCard meal={mockMeal} />
    );

    expect(getByText('テスト料理')).toBeTruthy();
    expect(getByTestId('meal-card')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const mockOnPress = jest.fn();
    const { getByTestId } = render(
      <MealCard meal={mockMeal} onPress={mockOnPress} />
    );

    fireEvent.press(getByTestId('meal-card'));
    expect(mockOnPress).toHaveBeenCalledWith(mockMeal);
  });

  it('displays tags when present', () => {
    const { getByText } = render(<MealCard meal={mockMeal} />);
    expect(getByText('和食')).toBeTruthy();
  });
});
```

### Hookテスト生成
```typescript
// ✅ AI生成推奨テンプレート
import { renderHook, act, waitFor } from '@testing-library/react-hooks';
import { useMeals } from '../useMeals';

// Mock設定
jest.mock('../services/mealService', () => ({
  MealService: {
    getAll: jest.fn(),
  },
}));

describe('useMeals', () => {
  const mockMeals: Meal[] = [
    { id: '1', name: 'テスト料理1' },
    { id: '2', name: 'テスト料理2' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (MealService.getAll as jest.Mock).mockResolvedValue(mockMeals);
  });

  it('loads meals successfully', async () => {
    const { result } = renderHook(() => useMeals());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.meals).toEqual(mockMeals);
    expect(result.current.error).toBeNull();
  });

  it('handles loading states correctly', () => {
    const { result } = renderHook(() => useMeals());

    expect(result.current.loading).toBe(true);
    expect(result.current.meals).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles errors appropriately', async () => {
    const errorMessage = 'Network error';
    (MealService.getAll as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useMeals());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.meals).toEqual([]);
  });
});
```

## 5. エラーハンドリング生成パターン

### 境界エラー処理
```typescript
// ✅ AI生成推奨パターン
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useErrorHandler } from '../hooks/useErrorHandler';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError
}) => (
  <View style={styles.container}>
    <Text style={styles.title}>エラーが発生しました</Text>
    <Text style={styles.message}>{error.message}</Text>
    <TouchableOpacity style={styles.button} onPress={resetError}>
      <Text style={styles.buttonText}>再試行</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  message: { fontSize: 16, color: '#666', marginBottom: 16 },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: 'bold' },
});
```

## 6. ナビゲーションコード生成

### スクリーン定義パターン
```typescript
// ✅ AI生成推奨パターン
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';

export type RootStackParamList = {
  Camera: undefined;
  MealDetail: { mealId: string };
  EditMeal: { mealId: string; isNew?: boolean };
};

export type CameraScreenProps = StackScreenProps<RootStackParamList, 'Camera'>;
export type MealDetailScreenProps = StackScreenProps<RootStackParamList, 'MealDetail'>;
export type EditMealScreenProps = StackScreenProps<RootStackParamList, 'EditMeal'>;

const Stack = createStackNavigator<RootStackParamList>();

export const MealNavigator: React.FC = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: '#f8f9fa' },
      headerTintColor: '#007AFF',
    }}
  >
    <Stack.Screen
      name="Camera"
      component={CameraScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="MealDetail"
      component={MealDetailScreen}
      options={({ route }) => ({
        title: '料理詳細',
      })}
    />
    <Stack.Screen
      name="EditMeal"
      component={EditMealScreen}
      options={({ route }) => ({
        title: route.params?.isNew ? '新規作成' : '編集',
      })}
    />
  </Stack.Navigator>
);
```

## 7. AIツール別補足指針

### Cursor向け補足
- `/docs/coding-standards.md` を常に参照
- 生成コードは**必ず**規約遵守を確認
- 提案時には規約違反点を指摘して改善

### GitHub Copilot向け補足
- `@workspace /docs/coding-standards.md` で文脈提供
- 生成されたコードの規約適合性を常にチェック
- 規約違反が検出された場合は修正を提案

### Claude.ai向け補足
- 技術仕様書とコーディング規約を同時に参照
- 生成前に要件を明確にし、規約順守を確認
- 提案理由を説明して透明性を確保

## 8. 品質チェックリスト

AI生成コードを使用する前に以下の点を**必ず確認**すること：

### 必須チェック項目
- [ ] TypeScript型定義が完全か（any使用なし）
- [ ] コンポーネントに適切なPropsインターフェースがあるか
- [ ] エラーハンドリングが適切に実装されているか
- [ ] StyleSheetオブジェクトを使用しているか
- [ ] パフォーマンス最適化（memoization, useCallback）が適切か
- [ ] ドキュメントコメントがJSDoc形式で記述されているか

### 推奨チェック項目
- [ ] 既存コードパターンとの一貫性があるか
- [ ] アクセシビリティ対応（accessibilityLabel等）が適切か
- [ ] テストコードが同時に生成されているか
- [ ] ハードコーディングされた値を定数化しているか

## 9. 生成コード修正ガイドライン

### 規約違反検出時の対応
1. **違反の特定**: 具体的にどの規約に違反しているかを特定
2. **修正提案**: 正しいコードパターンを提示
3. **理由説明**: なぜその修正が必要かを説明
4. **予防策**: 同様の誤りを防ぐためのガイドライン

### 一般的な修正パターン
- **any型使用** → 具体的な型定義に変更
- **インラインスタイル** → StyleSheetオブジェクト化
- **Promiseチェーン** → async/await使用
- **ハードコード値** → 定数化
- **不適切な命名** → 規約準拠の命名に変更

## 10. 継続的改善

### フィードバックループ
1. **生成コードの評価**: 品質チェック結果をドキュメントに反映
2. **パターン改善**: 繰り返しの問題を特定しガイドラインを更新
3. **新技術対応**: 新しいライブラリやパターンを規約に追加
4. **チーム共有**: 有効な生成パターンをチームに共有

このガイドラインは、AI開発支援ツールが**創造性と品質、保守性を両立したコード生成**を行うための基盤となることを目的とする。
