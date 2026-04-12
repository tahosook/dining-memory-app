// React Native Jest Setup is handled by jest-expo preset

process.env.BROWSERSLIST_IGNORE_OLD_DATA = 'true';

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
  },
});

// Platform mock
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  Version: 12,
  select: jest.fn(obj => obj?.ios ?? obj.default),
}));

// TurboModuleRegistry mock
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => ({
  getEnforcing: jest.fn(() => ({
    getConstants: jest.fn(() => ({})),
    get: jest.fn(() => ({})),
  })),
  get: jest.fn(() => ({})),
}));

// Expo Router mock
jest.mock('expo-router', () => ({
  Stack: () => null,
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
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

// AsyncStorage mock
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
}));

// Lodash mock (if used)
jest.mock('lodash', () => ({
  debounce: jest.fn(fn => fn),
  throttle: jest.fn(fn => fn),
}));
