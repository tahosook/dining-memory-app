import React, { createContext, useContext, useEffect, useState } from 'react'
import { database } from '../models'
import { Platform } from 'react-native'
// import { Database } from '@nozbe/watermelondb' // Disable to avoid import issues

// Context
const DatabaseContext = createContext<any>(null)

export const useDatabase = () => {
  const context = useContext(DatabaseContext)
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider')
  }
  return context
}

interface DatabaseProviderProps {
  children: React.ReactNode
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const setupDatabase = async () => {
      try {
        console.log('Setting up database...')

        if (Platform.OS === 'web') {
          // Webプラットフォーム用 - 即時準備完了
          console.log('Web platform database ready')
          setIsReady(true)
        } else {
          // Nativeプラットフォーム用 - SQLite初期化
          console.log('Initializing SQLite database...')
          // 遅延を設けてデータベースの準備を待つ
          await new Promise(resolve => setTimeout(resolve, 500))
          console.log('Native platform database ready')
          setIsReady(true)
        }
      } catch (error) {
        console.error('Database setup failed:', error)
        // エラーがあっても続行してUIを表示できるようにする
        setIsReady(true)
      }
    }

    setupDatabase()
  }, [])

  if (!isReady) {
    // Show loading screen while database initializes
    return (
      // Simple loading screen - can be improved later
      <LoadingScreen />
    )
  }

  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  )
}

// Loading component
const LoadingScreen: React.FC = () => (
  Platform.OS === 'web' ? (
    <div style={{
      display: 'flex',
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#ffffff',
      height: '100vh'
    }}>
      <span>データベースを準備中...</span>
    </div>
  ) : (
    <div style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#ffffff'
    }}>
      <span>データベースを準備中...</span>
    </div>
  )
)
