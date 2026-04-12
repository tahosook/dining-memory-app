import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Screen imports
import CameraScreen from '../screens/CameraScreen/CameraScreen';
import { RecordsScreen } from '../screens/RecordsScreen/RecordsScreen';
import { SearchScreen } from '../screens/SearchScreen/SearchScreen';
import StatsScreen from '../screens/StatsScreen/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen/SettingsScreen';

// Tab navigator
const Tab = createBottomTabNavigator();

// Colors for 40+ male target user - clean, high contrast
const COLORS = {
  tabBar: '#f8f9fa',
  activeTint: '#007AFF',
  inactiveTint: '#8e8e93',
};

function getTabIconName(routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap {
  if (routeName === 'Camera') {
    return focused ? 'camera' : 'camera-outline';
  }
  if (routeName === 'Records') {
    return focused ? 'list' : 'list-outline';
  }
  if (routeName === 'Search') {
    return focused ? 'search' : 'search-outline';
  }
  if (routeName === 'Stats') {
    return focused ? 'bar-chart' : 'bar-chart-outline';
  }
  return focused ? 'settings' : 'settings-outline';
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => {
            const iconName = getTabIconName(route.name, focused);
            return <Ionicons name={iconName} size={24} color={focused ? COLORS.activeTint : COLORS.inactiveTint} />;
          },
          tabBarActiveTintColor: COLORS.activeTint,
          tabBarInactiveTintColor: COLORS.inactiveTint,
          tabBarStyle: {
            backgroundColor: COLORS.tabBar,
            height: 70,
          },
          headerShown: route.name === 'Camera' ? false : true,
        })}
      >
        <Tab.Screen
          name="Camera"
          component={CameraScreen}
          options={{ title: '撮影' }}
        />
        <Tab.Screen
          name="Records"
          component={RecordsScreen}
          options={{ title: '記録' }}
        />
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{ title: '検索' }}
        />
        <Tab.Screen
          name="Stats"
          component={StatsScreen}
          options={{ title: '統計' }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: '設定' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
