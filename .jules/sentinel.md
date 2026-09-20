## 2026-09-20 - Insecure Randomness usage in IDs and Suffixes
**Vulnerability:** The application used `Math.random()` to generate IDs, temporary file suffixes, and fallback suffixes.
**Learning:** `Math.random()` is not a cryptographically secure random number generator (CSPRNG). Using it for unique identifiers or tokens can lead to predictable values and potential collisions or token guessing attacks.
**Prevention:** Always use a CSPRNG such as `expo-crypto`'s `randomUUID` or `getRandomValues` for generating unique identifiers, tokens, and file suffixes.
