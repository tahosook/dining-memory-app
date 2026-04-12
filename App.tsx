import React from 'react';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { DatabaseProvider } from './src/database/services/DatabaseProvider';

export default function App() {
  return (
    <DatabaseProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </DatabaseProvider>
  );
}
