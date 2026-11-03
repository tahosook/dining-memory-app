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

// Expo MediaLibrary mock
jest.mock('expo-media-library', () => ({
  Asset: {
    create: jest.fn(),
  },
  Album: {
    get: jest.fn(),
    create: jest.fn(),
  },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
}));

// Expo Image Picker mock
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

// Expo Updates mock
const mockUpdatesState = {
  isEnabled: false,
  isEmbeddedLaunch: true,
  updateId: null,
  channel: null,
  runtimeVersion: null,
};

jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockUpdatesState.isEnabled;
  },
  set isEnabled(val) {
    mockUpdatesState.isEnabled = val;
  },
  get isEmbeddedLaunch() {
    return mockUpdatesState.isEmbeddedLaunch;
  },
  set isEmbeddedLaunch(val) {
    mockUpdatesState.isEmbeddedLaunch = val;
  },
  get updateId() {
    return mockUpdatesState.updateId;
  },
  set updateId(val) {
    mockUpdatesState.updateId = val;
  },
  get channel() {
    return mockUpdatesState.channel;
  },
  set channel(val) {
    mockUpdatesState.channel = val;
  },
  get runtimeVersion() {
    return mockUpdatesState.runtimeVersion;
  },
  set runtimeVersion(val) {
    mockUpdatesState.runtimeVersion = val;
  },
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: false })),
  reloadAsync: jest.fn(async () => {}),
  __setMockUpdates: (overrides) => {
    Object.assign(mockUpdatesState, overrides);
  },
  __resetMockUpdates: () => {
    mockUpdatesState.isEnabled = false;
    mockUpdatesState.isEmbeddedLaunch = true;
    mockUpdatesState.updateId = null;
    mockUpdatesState.channel = null;
    mockUpdatesState.runtimeVersion = null;
  },
}));




