import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// 仮の画面コンポーネント
import CameraScreen from '../screens/CameraScreen/CameraScreen';
import RecordsScreen from '../screens/RecordsScreen/RecordsScreen';
import SearchScreen from '../screens/SearchScreen/SearchSreen';
import StatsScreen from '../screens/StatsScreen/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen/SettingScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === '撮影') {
            iconName = focused ? 'camera' : 'camera-outline';
          } else if (route.name === '記録') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === '検索') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === '統計') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen name="撮影" component={CameraScreen} />
      <Tab.Screen name="記録" component={RecordsScreen} />
      <Tab.Screen name="検索" component={SearchScreen} />
      <Tab.Screen name="統計" component={StatsScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  );
}