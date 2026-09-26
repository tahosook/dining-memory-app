import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { DatabaseProvider } from './src/database/services/DatabaseProvider';

Sentry.init({
  dsn: '', // TODO: Add Sentry DSN here
  debug: false,
});

function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <DatabaseProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});
