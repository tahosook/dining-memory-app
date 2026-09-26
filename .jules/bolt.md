## 2024-09-20 - Preventing O(N^2) Re-renders in Lists
**Learning:** In React Native, if a list item's `onPress` callback depends on the entire list data (e.g., to pass the full list to a detail screen for swiping), updating a single item (like lazily loading a thumbnail) changes the list data reference. This invalidates the `onPress` callback for ALL items, causing the entire list to re-render for every single thumbnail loaded, completely bypassing `React.memo`.
**Action:** Use a `useRef` to hold the latest list data for the `onPress` callback to keep its reference stable. Combined with `useCallback` for `renderItem`, this allows `React.memo` to properly skip re-renders for unchanged list items.
## 2026-09-21 - React.memo with Mutable Ref Pattern
**Learning:** In a React Native `FlatList`, inline `renderItem` functions cause widespread unnecessary re-renders of all items when the parent component updates (like appending paginated results). However, memoizing the item requires stable callback references. Standard `useCallback` with dependencies causes the callback to recreate frequently.
**Action:** Use the "Mutable Ref Pattern" to store frequently changing state (like the results list) in a `useRef`, allowing callbacks like `onPress` to access current state without breaking their stable reference, thereby enabling `React.memo` to effectively skip re-renders for list items.

## 2024-05-18 - Concurrent I/O During Backup Restore
**Learning:** Sequential file operations during a loop severely bottleneck restore speeds when processing multiple images. Using simulated timings of ~5ms per I/O call, sequential execution took ~1300ms while concurrency took ~28ms.
**Action:** When working with file I/O operations (like fetching metadata, moving, or copying files) within loops, refactor them using `Promise.all()` to process them concurrently. Be mindful that pushing into JS arrays inside Promises is safe from race conditions due to the event loop model.
