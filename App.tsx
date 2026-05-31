import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { DatabaseProvider } from './src/database/services/DatabaseProvider';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <DatabaseProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});
