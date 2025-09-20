import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function StatsScreen() {
  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 統計</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.periodButton}>
            <Text style={styles.periodButtonText}>今月 ▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* サマリーカード */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>📈 今月のサマリー</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>45件</Text>
              <Text style={styles.summaryLabel}>記録数 (前月+8件)</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>17件</Text>
              <Text style={styles.summaryLabel}>自宅 (38%)</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>28件</Text>
              <Text style={styles.summaryLabel}>外食 (62%)</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>○○ラーメン</Text>
              <Text style={styles.summaryLabel}>よく行く店</Text>
            </View>
          </View>
        </View>

        {/* 自炊分析 */}
        <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>🏠 自炊の傾向分析</Text>
          <View style={styles.cookingLevels}>
            <View style={styles.levelItem}>
              <Text style={styles.levelEmoji}>⚡</Text>
              <Text style={styles.levelName}>時短料理</Text>
              <View style={styles.levelBar}>
                <View style={[styles.levelProgress, { width: '40%' }]} />
              </View>
              <Text style={styles.levelCount}>8件</Text>
            </View>
            <View style={styles.levelItem}>
              <Text style={styles.levelEmoji}>🍳</Text>
              <Text style={styles.levelName}>日常料理</Text>
              <View style={styles.levelBar}>
                <View style={[styles.levelProgress, { width: '60%' }]} />
              </View>
              <Text style={styles.levelCount}>12件</Text>
            </View>
            <View style={styles.levelItem}>
              <Text style={styles.levelEmoji}>👨‍🍳</Text>
              <Text style={styles.levelName}>本格料理</Text>
              <View style={styles.levelBar}>
                <View style={[styles.levelProgress, { width: '20%' }]} />
              </View>
              <Text style={styles.levelCount}>4件</Text>
            </View>
          </View>
          
          <View style={styles.specialCooking}>
            <Text style={styles.specialTitle}>🌟 特別な自炊発見:</Text>
            <Text style={styles.specialText}>9/15「手作り餃子」→ 3ヶ月ぶりの本格自炊！</Text>
          </View>
        </View>

        {/* レパートリー発見 */}
        <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>🔍 あなたの自炊レパートリー</Text>
          <Text style={styles.subTitle}>よく作る料理 TOP5:</Text>
          
          <View style={styles.repertoireList}>
            <View style={styles.repertoireItem}>
              <Text style={styles.rank}>1.</Text>
              <Text style={styles.dishName}>パスタ (6回)</Text>
            </View>
            <View style={styles.repertoireItem}>
              <Text style={styles.rank}>2.</Text>
              <Text style={styles.dishName}>炒飯 (4回)</Text>
            </View>
            <View style={styles.repertoireItem}>
              <Text style={styles.rank}>3.</Text>
              <Text style={styles.dishName}>カレー (3回)</Text>
            </View>
          </View>

          <View style={styles.insight}>
            <Text style={styles.insightTitle}>💡 最近の傾向:</Text>
            <Text style={styles.insightText}>パスタブーム継続中！過去3週間で4回も作成</Text>
          </View>

          <View style={styles.forgotten}>
            <Text style={styles.forgottenTitle}>🤔 そういえば:</Text>
            <Text style={styles.forgottenText}>以前よく作った「親子丼」最後に作ったのは2ヶ月前</Text>
            <Text style={styles.forgottenSuggest}>また作ってみる？</Text>
          </View>
        </View>

        {/* 行動パターン */}
        <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>🕵️ 隠れたルーティン</Text>
          
          <View style={styles.routineItem}>
            <Text style={styles.routineIcon}>🗓️</Text>
            <View style={styles.routineContent}>
              <Text style={styles.routineTitle}>「火曜日は中華の日」</Text>
              <Text style={styles.routineDetail}>過去8週中6回が中華料理</Text>
            </View>
          </View>

          <View style={styles.routineItem}>
            <Text style={styles.routineIcon}>☕</Text>
            <View style={styles.routineContent}>
              <Text style={styles.routineTitle}>「午後3時のカフェタイム」</Text>
              <Text style={styles.routineDetail}>平日の15-16時に高確率</Text>
            </View>
          </View>

          <View style={styles.routineItem}>
            <Text style={styles.routineIcon}>🍺</Text>
            <View style={styles.routineContent}>
              <Text style={styles.routineTitle}>「金曜の一杯は必須」</Text>
              <Text style={styles.routineDetail}>金曜記録の90%にアルコール</Text>
            </View>
          </View>
        </View>

        {/* 振り返り */}
        <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>📝 今月の振り返り</Text>
          <View style={styles.reflection}>
            <Text style={styles.reflectionItem}>記録した日数: 30/30日</Text>
            <Text style={styles.reflectionItem}>最も多かった料理: ラーメン</Text>
            <Text style={styles.reflectionItem}>最も多かった場所: 自宅</Text>
            <Text style={styles.reflectionItem}>初めて記録した料理: つけ麺</Text>
          </View>
          
          <View style={styles.discovery}>
            <Text style={styles.discoveryTitle}>🤔 ちょっとした発見:</Text>
            <Text style={styles.discoveryText}>「最近、自炊が増えてる？」</Text>
            <Text style={styles.discoveryDetail}>6月: 8回 → 9月: 17回</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  analysisCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryItem: {
    width: '50%',
    marginBottom: 16,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  cookingLevels: {
    marginBottom: 16,
  },
  levelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  levelName: {
    fontSize: 14,
    fontWeight: '500',
    width: 80,
  },
  levelBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  levelProgress: {
    height: 8,
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  levelCount: {
    fontSize: 14,
    fontWeight: 'bold',
    width: 40,
    textAlign: 'right',
  },
  specialCooking: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
  },
  specialTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  specialText: {
    fontSize: 14,
    color: '#856404',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  repertoireList: {
    marginBottom: 16,
  },
  repertoireItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rank: {
    fontSize: 16,
    fontWeight: 'bold',
    width: 20,
  },
  dishName: {
    fontSize: 16,
    marginLeft: 8,
  },
  insight: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    color: '#1565c0',
  },
  forgotten: {
    backgroundColor: '#f3e5f5',
    padding: 12,
    borderRadius: 8,
  },
  forgottenTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  forgottenText: {
    fontSize: 14,
    color: '#6a1b9a',
    marginBottom: 4,
  },
  forgottenSuggest: {
    fontSize: 14,
    color: '#6a1b9a',
    fontStyle: 'italic',
  },
  routineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  routineIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  routineContent: {
    flex: 1,
  },
  routineTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  routineDetail: {
    fontSize: 14,
    color: '#666',
  },
  reflection: {
    marginBottom: 16,
  },
  reflectionItem: {
    fontSize: 14,
    marginBottom: 6,
    paddingLeft: 8,
  },
  discovery: {
    backgroundColor: '#f0f4c3',
    padding: 12,
    borderRadius: 8,
  },
  discoveryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  discoveryText: {
    fontSize: 14,
    color: '#558b2f',
    marginBottom: 4,
  },
  discoveryDetail: {
    fontSize: 14,
    color: '#558b2f',
    fontWeight: 'bold',
  },
});