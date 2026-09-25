## 2024-05-24 - Accessibility Labels for Icon-only Buttons
**Learning:** Found an icon-only button (Settings icon "⚙️") in `RecordsScreen.tsx` that lacked any accessibility attributes. Such buttons are invisible to screen readers without proper labels.
**Action:** Next time, always ensure icon-only buttons (`TouchableOpacity` wrapping an icon/emoji) have `accessibilityLabel`, `accessibilityHint`, and `accessibilityRole="button"`.
## 2026-09-21 - Dynamic Accessibility State for Toggles
**Learning:** Found a toggle button for search filters that changed state visually but didn't announce its current state to screen readers.
**Action:** Next time, when adding a11y to toggle buttons, don't just add a label; always include `accessibilityState={{ expanded: isVisible }}` so screen reader users know the current state.
## 2024-05-24 - Accessibility Labels for AI Details Toggle Button
**Learning:** Found a toggle button in `SettingsScreen.tsx` that changed state visually to show or hide "AI Details" but lacked any accessibility attributes. Screen reader users would have no context about the button's action or current expanded state.
**Action:** Always ensure toggle buttons that reveal or hide content have proper `accessibilityRole="button"`, descriptive `accessibilityLabel` and `accessibilityHint`, and most importantly, `accessibilityState={{ expanded: isVisible }}` to accurately announce the current state.
## 2024-09-24 - Enhance Modal Accessibility
**Learning:** Adding comprehensive accessibility props (`accessibilityRole`, `accessibilityLabel`, and `accessibilityState`) to interactive elements within complex forms (like `MealEditModal`) ensures that screen readers can accurately interpret the form's structure and state, making the app significantly more usable for visually impaired users.
**Action:** Always verify that interactive components have the necessary accessibility attributes, especially in heavily-used forms and modals.
## 2024-03-24 - Redundant Accessibility Labels in React Native
**Learning:** Adding an `accessibilityLabel` that exactly matches the button's only `<Text>` child is redundant in React Native, as screen readers natively read the child text of a `TouchableOpacity`.
**Action:** Only add `accessibilityLabel` to buttons when the child text is not descriptive enough, when it's an icon-only button, or when providing a more descriptive label for screen reader users than the visible text.
