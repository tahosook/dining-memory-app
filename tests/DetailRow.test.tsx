import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DetailRow } from '../src/components/common/DetailRow';

describe('DetailRow', () => {
  it('renders the label and value correctly', () => {
    render(<DetailRow label="Test Label" value="Test Value" />);

    expect(screen.getByText('Test Label')).toBeTruthy();
    expect(screen.getByText('Test Value')).toBeTruthy();
  });
});
