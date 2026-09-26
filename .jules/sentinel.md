## 2026-09-20 - Insecure Randomness usage in IDs and Suffixes
**Vulnerability:** The application used `Math.random()` to generate IDs, temporary file suffixes, and fallback suffixes.
**Learning:** `Math.random()` is not a cryptographically secure random number generator (CSPRNG). Using it for unique identifiers or tokens can lead to predictable values and potential collisions or token guessing attacks.
**Prevention:** Always use a CSPRNG such as `expo-crypto`'s `randomUUID` or `getRandomValues` for generating unique identifiers, tokens, and file suffixes.

## 2026-09-26 - Zip Slip / Unsafe Zip Extraction Prevention
**Vulnerability:** Calling `unzip()` directly on untrusted zip files could expose the staging directory to path traversal (`../`) or unapproved files.
**Learning:** Even if native libraries implement basic safeguards, extracting an entire archive allows potentially dangerous files to hit the file system before JS validation. `react-native-zip-archive`'s `listContents` is essential for pre-flight verification.
**Prevention:** Implement Defense-in-Depth. Use `listContents` to strictly whitelist allowed file paths and explicitly reject malicious patterns (e.g. `../`, null bytes) *before* calling `unzip()`.
