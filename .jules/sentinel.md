## 2026-09-20 - Insecure Randomness usage in IDs and Suffixes
**Vulnerability:** The application used `Math.random()` to generate IDs, temporary file suffixes, and fallback suffixes.
**Learning:** `Math.random()` is not a cryptographically secure random number generator (CSPRNG). Using it for unique identifiers or tokens can lead to predictable values and potential collisions or token guessing attacks.
**Prevention:** Always use a CSPRNG such as `expo-crypto`'s `randomUUID` or `getRandomValues` for generating unique identifiers, tokens, and file suffixes.

## 2024-05-20 - [Privacy] Sanitize local file paths in application logs
**Vulnerability:** Raw local file paths (e.g., `file:///data/user/0/...`) and raw `Error` objects containing absolute paths in stack traces were being written to console output during media operations (camera capture, thumbnail generation, sharing).
**Learning:** React Native applications executing operations on local media files often log context for debugging, but absolute paths on devices are sensitive and should not be persisted in plain text, per privacy guidelines.
**Prevention:** Implement a logging sanitizer utility (`logSanitizer.ts`) and wrap debug objects with it before calling `console.warn` or `console.error` to redact device-specific directory paths while preserving stack trace line numbers and filenames.
