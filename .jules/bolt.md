## 2024-05-14 - React Native List Virtualization
**Learning:** Default FlatList/SectionList settings load many items (approx 21 screens worth) upfront, which causes significant JS thread spikes and delays the initial screen render when lists contain complex items (like high-res thumbnails in RecordsScreen and SearchScreen).
**Action:** Always tune `initialNumToRender` (to match the viewport size, e.g., 8), `maxToRenderPerBatch`, and `windowSize` to conserve memory and speed up initial mount for long lists of complex items.
