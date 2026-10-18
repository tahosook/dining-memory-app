module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  modulePathIgnorePatterns: [
    '<rootDir>/artifacts/',
    '<rootDir>/state/',
    '<rootDir>/android/',
    '<rootDir>/\\.venv',
  ],
  watchPathIgnorePatterns: [
    '<rootDir>/artifacts/',
    '<rootDir>/state/',
    '<rootDir>/android/',
    '<rootDir>/\\.venv',
  ],
  testMatch: [
    '**/__tests__/**/*.{ts,tsx}',
    '**/?(*.)+(test).{ts,tsx}',
    '**/?(*.)+(spec).{ts,tsx}'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|@react-navigation/.*|@expo-modules-core|@expo-modules-core/.*|@expo-modules-core/shared|@expo-modules-core/shared/.*|expo-modules-core/.*/.*|@expo/vector-icons|@expo/vector-icons/.*|expo|expo/.*/.*|expo-asset/.*|expo-crypto|expo-crypto/.*|expo-file-system/.*|expo-document-picker/.*|expo-sharing/.*|llama\\.rn))'
  ],
};
