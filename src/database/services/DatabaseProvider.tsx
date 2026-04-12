import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { database } from '../models';
import { Colors } from '../../constants/Colors';

const DatabaseContext = createContext(database);

export const useDatabase = () => useContext(DatabaseContext);

interface DatabaseProviderProps {
  children: React.ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const setupDatabase = async () => {
      try {
        await database.initialize();
      } catch (error) {
        console.error('Database setup failed:', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    setupDatabase();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>;
};

const LoadingScreen: React.FC = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={Colors.primary} />
    <Text style={styles.loadingText}>データベースを準備中...</Text>
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    gap: 12,
  },
  loadingText: {
    color: Colors.text,
    fontSize: 16,
  },
});
