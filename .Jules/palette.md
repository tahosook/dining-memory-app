## 2024-05-24 - Accessibility Labels for Icon-only Buttons
**Learning:** Found an icon-only button (Settings icon "⚙️") in `RecordsScreen.tsx` that lacked any accessibility attributes. Such buttons are invisible to screen readers without proper labels.
**Action:** Next time, always ensure icon-only buttons (`TouchableOpacity` wrapping an icon/emoji) have `accessibilityLabel`, `accessibilityHint`, and `accessibilityRole="button"`.
