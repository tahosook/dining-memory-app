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

export default function RootNavigator() {
  console.log('RootNavigator with tabs loaded');
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, size }) => {
            let iconName: any = 'home';

            if (route.name === 'Camera') {
              iconName = focused ? 'camera' : 'camera-outline';
            } else if (route.name === 'Records') {
              iconName = focused ? 'list' : 'list-outline';
            } else if (route.name === 'Search') {
              iconName = focused ? 'search' : 'search-outline';
            } else if (route.name === 'Stats') {
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            }

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
