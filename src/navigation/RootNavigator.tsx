import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Screen imports
import CameraScreen from '../screens/CameraScreen/CameraScreen';
import RecordsScreen from '../screens/RecordsScreen/RecordsScreen';
import SearchScreen from '../screens/SearchScreen/SearchSreen';
import StatsScreen from '../screens/StatsScreen/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen/SettingScreen';

// Tab navigator
const Tab = createBottomTabNavigator();

// Colors for 40+ male target user - clean, high contrast
const COLORS = {
  tabBar: '#f8f9fa',
  activeTint: '#007AFF',
  inactiveTint: '#8e8e93',
};

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const iconSize = 24;
            let iconName: any;

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

            return <Ionicons name={iconName} size={iconSize} color={color} />;
          },
          tabBarActiveTintColor: COLORS.activeTint,
          tabBarInactiveTintColor: COLORS.inactiveTint,
          tabBarStyle: {
            backgroundColor: COLORS.tabBar,
            borderTopWidth: 1,
            borderTopColor: '#e0e0e0',
            paddingBottom: 5,
            paddingTop: 5,
            height: 70,
          },
          tabBarLabelStyle: {
            fontSize: 12,
          },
          headerStyle: {
            backgroundColor: '#ffffff',
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTintColor: '#000000',
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 18,
          },
          // Larger touch areas for 40+ users
          tabBarItemStyle: {
            paddingVertical: 8,
          },
        })}
      >
        <Tab.Screen
          name="Camera"
          component={CameraScreen}
          options={{
            title: '撮影',
            headerShown: false, // Camera needs full screen
          }}
        />
        <Tab.Screen
          name="Records"
          component={RecordsScreen}
          options={{
            title: '記録',
          }}
        />
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{
            title: '検索',
          }}
        />
        <Tab.Screen
          name="Stats"
          component={StatsScreen}
          options={{
            title: '統計',
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: '設定',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
