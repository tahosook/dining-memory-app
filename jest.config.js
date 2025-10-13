module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
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
    'node_modules/(?!((jest-)?react-native|@react-native|@expo-modules-core|@expo-modules-core/.*|@expo-modules-core/shared|@expo-modules-core/shared/.*|expo-modules-core/.*/.*|@expo/vector-icons|@expo/vector-icons/.*|expo/.*/.*))'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
};
