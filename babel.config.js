module.exports = {
  presets: [
    ['babel-preset-expo'],
    '@babel/preset-typescript',
    '@babel/preset-flow',
  ],
  plugins: [
    'react-native-reanimated/plugin', // This should be last
  ],
};
