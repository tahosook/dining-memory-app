import React, { createContext, useContext, useEffect, useState } from 'react'
import { database } from '../models'
import { Database } from '@nozbe/watermelondb'

// Context
const DatabaseContext = createContext<Database | null>(null)

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
        // Ensure database is ready
        await database.adapter.getDb()
        setIsReady(true)
      } catch (error) {
        console.error('Database setup failed:', error)
        setIsReady(true) // Continue anyway
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
  <div style={{
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  }}>
    <div>データベースを準備中...</div>
  </div>
)
