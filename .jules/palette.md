## 2024-05-24 - Accessibility Labels for Icon-only Buttons
**Learning:** Found an icon-only button (Settings icon "⚙️") in `RecordsScreen.tsx` that lacked any accessibility attributes. Such buttons are invisible to screen readers without proper labels.
**Action:** Next time, always ensure icon-only buttons (`TouchableOpacity` wrapping an icon/emoji) have `accessibilityLabel`, `accessibilityHint`, and `accessibilityRole="button"`.
## 2026-09-21 - Dynamic Accessibility State for Toggles
**Learning:** Found a toggle button for search filters that changed state visually but didn't announce its current state to screen readers.
**Action:** Next time, when adding a11y to toggle buttons, don't just add a label; always include `accessibilityState={{ expanded: isVisible }}` so screen reader users know the current state.
