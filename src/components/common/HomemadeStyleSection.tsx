import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { formatCookingLevel } from '../../utils/cookingLevel';
import type { CookingLevel } from '../../types/MealTypes';
import type { MealEditDraft } from './MealEditModal';

export type HomemadeStyleSectionProps = {
  isHomemade: boolean;
  cookingLevel: CookingLevel | '';
  updateHomemade: (value: boolean) => void;
  updateDraft: <Key extends keyof MealEditDraft>(key: Key, value: MealEditDraft[Key]) => void;
  testIDPrefix?: string;
};

export function HomemadeStyleSection({
  isHomemade,
  cookingLevel,
  updateHomemade,
  updateDraft,
  testIDPrefix = 'meal-edit',
}: HomemadeStyleSectionProps) {
  return (
    <>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>自炊として記録</Text>
        <Switch
          value={isHomemade}
          onValueChange={updateHomemade}
          accessibilityRole="switch"
          accessibilityLabel="自炊として記録"
          accessibilityState={{ checked: isHomemade }}
          testID={`${testIDPrefix}-homemade-switch`}
        />
      </View>
      {isHomemade ? (
        <View style={styles.styleBlock}>
          <Text style={styles.fieldLabel}>自炊スタイル</Text>
          <View style={styles.segmentedRow}>
            {(['quick', 'daily', 'gourmet'] as const).map(level => {
              const selected = cookingLevel === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[styles.segmentButton, selected ? styles.segmentButtonSelected : null]}
                  onPress={() => updateDraft('cookingLevel', level)}
                  accessibilityRole="button"
                  accessibilityLabel={formatCookingLevel(level)}
                  accessibilityState={{ selected }}
                  testID={`${testIDPrefix}-cooking-level-${level}`}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      selected ? styles.segmentButtonTextSelected : null,
                    ]}
                  >
                    {formatCookingLevel(level)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 15,
    color: Colors.text,
  },
  styleBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  segmentButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#eaf4ff',
  },
  segmentButtonText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
  },
  segmentButtonTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
