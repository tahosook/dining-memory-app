## 2025-03-01 - Parallelize file operations

**Learning:** When performing blocking file I/O operations inside a loop for a large number of items (like file copies), a sequential loop introduces significant bottlenecking.

**Action:** Map the items into an array of Promises and use `Promise.all()` to execute the asynchronous operations concurrently, leveraging the underlying parallel I/O capabilities for massive speedups while maintaining fail-fast error behavior.
