import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';

// Basic app setup - will add database provider later
export default function App() {
  return (
    <View style={styles.container}>
      <RootNavigator />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
