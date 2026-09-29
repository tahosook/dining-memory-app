import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MealEditModal, MealEditDraft } from '../src/components/common/MealEditModal';

// Mock dependencies to focus purely on the Modal behavior
jest.mock('../src/components/common/CuisineTypeSelector', () => {
  const { View } = require('react-native');
  return {
    CuisineTypeSelector: () => <View testID="mock-cuisine-selector" />,
  };
});

jest.mock('../src/components/common/MealInputAssistSection', () => {
  const { View } = require('react-native');
  return {
    MealInputAssistSection: () => <View testID="mock-meal-input-assist-section" />,
  };
});

const defaultDraft: MealEditDraft = {
  mealName: '',
  cuisineType: 'japanese',
  location: '',
  notes: '',
  isHomemade: false,
  cookingLevel: '',
};

describe('MealEditModal', () => {
  const mockOnChange = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnRotateImage = jest.fn();
  const mockOnRequestAiSuggestions = jest.fn();
  const mockOnApplyNoteDraftSuggestion = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(getByText('記録を編集')).toBeTruthy();
    expect(getByTestId('meal-edit-meal-name-input')).toBeTruthy();
    expect(getByTestId('meal-edit-location-input')).toBeTruthy();
    expect(getByTestId('meal-edit-notes-input')).toBeTruthy();
    expect(getByTestId('meal-edit-homemade-switch')).toBeTruthy();
    expect(getByTestId('meal-edit-save-button')).toBeTruthy();
    expect(getByTestId('meal-edit-close-button')).toBeTruthy();

    // Should not render image specific things if imageUri is not provided
    expect(queryByTestId('meal-edit-image-preview')).toBeNull();
    // Should not render cooking level segment if not homemade
    expect(queryByTestId('meal-edit-cooking-level-quick')).toBeNull();
  });

  it('renders image preview and rotate button when imageUri is provided', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
        imageUri="file://test/image.jpg"
        onRotateImage={mockOnRotateImage}
      />
    );

    expect(getByTestId('meal-edit-image-preview')).toBeTruthy();
    expect(getByTestId('meal-edit-rotate-image-button')).toBeTruthy();
  });

  it('calls onRotateImage when rotate button is pressed', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
        imageUri="file://test/image.jpg"
        onRotateImage={mockOnRotateImage}
      />
    );

    fireEvent.press(getByTestId('meal-edit-rotate-image-button'));
    expect(mockOnRotateImage).toHaveBeenCalledTimes(1);
  });

  it('calls onChange when inputs are updated', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    fireEvent.changeText(getByTestId('meal-edit-meal-name-input'), 'New Meal');
    expect(mockOnChange).toHaveBeenCalledWith({ ...defaultDraft, mealName: 'New Meal' });

    fireEvent.changeText(getByTestId('meal-edit-location-input'), 'Tokyo');
    expect(mockOnChange).toHaveBeenCalledWith({ ...defaultDraft, location: 'Tokyo' });

    fireEvent.changeText(getByTestId('meal-edit-notes-input'), 'Delicious');
    expect(mockOnChange).toHaveBeenCalledWith({ ...defaultDraft, notes: 'Delicious' });
  });

  it('calls onChange when homemade switch is toggled and clears cooking level when set to false', () => {
    const { getByTestId, rerender } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    fireEvent(getByTestId('meal-edit-homemade-switch'), 'onValueChange', true);
    expect(mockOnChange).toHaveBeenCalledWith({ ...defaultDraft, isHomemade: true, cookingLevel: '' });

    // Rerender with isHomemade = true
    const homemadeDraft: MealEditDraft = { ...defaultDraft, isHomemade: true, cookingLevel: 'daily' };
    rerender(
      <MealEditModal
        visible={true}
        draft={homemadeDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    fireEvent(getByTestId('meal-edit-homemade-switch'), 'onValueChange', false);
    expect(mockOnChange).toHaveBeenCalledWith({ ...homemadeDraft, isHomemade: false, cookingLevel: '' });
  });

  it('shows cooking level segments when homemade is true and calls onChange when selected', () => {
    const homemadeDraft: MealEditDraft = { ...defaultDraft, isHomemade: true };
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={homemadeDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const dailyLevel = getByTestId('meal-edit-cooking-level-daily');
    expect(dailyLevel).toBeTruthy();

    fireEvent.press(dailyLevel);
    expect(mockOnChange).toHaveBeenCalledWith({ ...homemadeDraft, cookingLevel: 'daily' });
  });

  it('calls onSave when save button is pressed', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    fireEvent.press(getByTestId('meal-edit-save-button'));
    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is pressed', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    fireEvent.press(getByTestId('meal-edit-close-button'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('disables buttons when saving is true', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
        saving={true}
      />
    );

    const saveButton = getByTestId('meal-edit-save-button');
    const closeButton = getByTestId('meal-edit-close-button');

    expect(saveButton.props.accessibilityState.disabled).toBe(true);
    expect(closeButton.props.accessibilityState.disabled).toBe(true);
  });

  it('renders MealInputAssistSection when required props are provided', () => {
    const { getByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
        imageUri="file://test/image.jpg"
        aiAssistStatus="idle"
        aiAssistSuggestions={{ source: "test", noteDraft: null, mealNames: [], cuisineTypes: [] }}
        onRequestAiSuggestions={mockOnRequestAiSuggestions}
        onApplyNoteDraftSuggestion={mockOnApplyNoteDraftSuggestion}
      />
    );

    expect(getByTestId('mock-meal-input-assist-section')).toBeTruthy();
  });

  it('does not render MealInputAssistSection when required props are missing', () => {
    const { queryByTestId } = render(
      <MealEditModal
        visible={true}
        draft={defaultDraft}
        onChange={mockOnChange}
        onSave={mockOnSave}
        onClose={mockOnClose}
        // Missing imageUri, onRequestAiSuggestions, etc.
        aiAssistStatus="idle"
        aiAssistSuggestions={{ source: "test", noteDraft: null, mealNames: [], cuisineTypes: [] }}
      />
    );

    expect(queryByTestId('mock-meal-input-assist-section')).toBeNull();
  });
});
