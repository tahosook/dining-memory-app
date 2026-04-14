import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CUISINE_TYPE_OPTIONS, type CuisineTypeOption } from '../../constants/MealOptions';
import { Colors } from '../../constants/Colors';

type CuisineTypeSelectorProps = {
  label?: string;
  value?: string;
  onChange: (value: CuisineTypeOption | '') => void;
  testIDPrefix?: string;
  labelColor?: string;
  showLabel?: boolean;
};

export function CuisineTypeSelector({
  label = '料理ジャンル',
  value = '',
  onChange,
  testIDPrefix = 'cuisine-type',
  labelColor = Colors.text,
  showLabel = true,
}: CuisineTypeSelectorProps) {
  return (
    <View style={styles.container}>
      {showLabel ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      <View style={styles.optionsRow}>
        {CUISINE_TYPE_OPTIONS.map((option) => {
          const isSelected = value === option;

          return (
            <TouchableOpacity
              key={option}
              style={[styles.optionChip, isSelected ? styles.optionChipSelected : styles.optionChipIdle]}
              onPress={() => onChange(isSelected ? '' : option)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              testID={`${testIDPrefix}-${option}`}
            >
              <Text style={[styles.optionText, isSelected ? styles.optionTextSelected : styles.optionTextIdle]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionChipIdle: {
    backgroundColor: Colors.white,
    borderColor: '#d9d9d9',
  },
  optionChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextIdle: {
    color: Colors.text,
  },
  optionTextSelected: {
    color: Colors.white,
  },
});
