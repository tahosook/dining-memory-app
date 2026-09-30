import React from 'react';
import { Text, View, Button } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

const ThrowError = ({ shouldThrow }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <Text>Normal Child</Text>;
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Suppress React's error logging during tests, and allow us to assert on our custom logging
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    if (typeof window !== 'undefined' && !window.dispatchEvent) {
      (window as unknown as { dispatchEvent: () => boolean }).dispatchEvent = jest.fn();
    }
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Child')).toBeTruthy();
  });

  it('renders the default fallback UI when a child component throws an error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('カメラ機能でエラーが発生しました')).toBeTruthy();
    expect(screen.getByText('Test error message')).toBeTruthy();
    expect(screen.getByText('再試行')).toBeTruthy();
  });

  it('renders a custom fallback UI when the fallback prop is provided', () => {
    const fallback = (error: Error, retry: () => void) => (
      <View>
        <Text>Custom Error: {error.message}</Text>
        <Button title="Custom Retry" onPress={retry} />
      </View>
    );

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error: Test error message')).toBeTruthy();
    expect(screen.getByText('Custom Retry')).toBeTruthy();
  });

  it('pressing the "Retry" button on the default fallback UI resets the error state', () => {
    let shouldThrow = true;
    const BuggyComponent = () => {
      if (shouldThrow) {
        throw new Error('Test error message');
      }
      return <Text>Recovered Child</Text>;
    };

    render(
      <ErrorBoundary>
        <BuggyComponent />
      </ErrorBoundary>
    );

    // Initial state: error UI
    expect(screen.getByText('カメラ機能でエラーが発生しました')).toBeTruthy();

    // Fix condition and press retry
    shouldThrow = false;
    fireEvent.press(screen.getByText('再試行'));

    // Should now render recovered child
    expect(screen.getByText('Recovered Child')).toBeTruthy();
  });

  it('logs the error securely to console.error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'CameraScreen Error:',
      expect.objectContaining({
        name: 'Error',
        message: 'Test error message',
      })
    );
  });
});
