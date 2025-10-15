export const Colors = {
  primary: '#007AFF',
  secondary: '#6c757d',
  background: '#f8f9fa',
  text: '#212529',
  error: '#dc3545',
  success: '#28a745',
  warning: '#ffc107',
  info: '#17a2b8',
  white: '#ffffff',
  black: '#000000',
  gray: '#6c757d',
  lightGray: '#f8f9fa',
  darkGray: '#343a40',
} as const;

export type ColorKey = keyof typeof Colors;
