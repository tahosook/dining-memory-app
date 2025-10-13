import React from 'react';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';

// Basic app setup for Expo Go testing
export default function App() {
  console.log('App component loaded');
  return (
    <>
      <RootNavigator />
      <StatusBar style="auto" />
    </>
  );
}
