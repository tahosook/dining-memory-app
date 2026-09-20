// React Native Jest Setup is handled by jest-expo preset

process.env.BROWSERSLIST_IGNORE_OLD_DATA = 'true';

require('react-native-gesture-handler/jestSetup');

// Prevent React Native from redefining window
if (typeof global.window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: global,
    writable: false,
  });
}

// Mock crypto.getRandomValues for UUID generation
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }),
    randomUUID: jest.fn(() => {
      return '12345678-1234-1234-1234-123456789012';
    })
  },
});

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '12345678-1234-1234-1234-123456789012')
}));

// Expo Font mock
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(),
  isLoaded: jest.fn(() => true),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Document Picker mock
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

// Expo Sharing mock
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

// Zip Archive mock
jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(),
  unzip: jest.fn(),
}));

