import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/Colors';

export const TopRankingCard = React.memo(function TopRankingCardComponent({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: Array<{ label: string; count: number }>;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailTitle}>{title}</Text>
      {items.length > 0 ? (
        items.map((item, index) => (
          <View key={item.label} style={styles.rankingRow}>
            <Text style={styles.rankingLabel}>
              {index + 1}. {item.label}
            </Text>
            <Text style={styles.rankingCount}>{item.count}件</Text>
          </View>
        ))
      ) : (
        <Text style={styles.detailText}>{emptyText}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  detailCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    gap: 10,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  detailText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  rankingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rankingLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  rankingCount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
});
