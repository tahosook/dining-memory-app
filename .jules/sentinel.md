## 2026-09-20 - Insecure Randomness usage in IDs and Suffixes
**Vulnerability:** The application used `Math.random()` to generate IDs, temporary file suffixes, and fallback suffixes.
**Learning:** `Math.random()` is not a cryptographically secure random number generator (CSPRNG). Using it for unique identifiers or tokens can lead to predictable values and potential collisions or token guessing attacks.
**Prevention:** Always use a CSPRNG such as `expo-crypto`'s `randomUUID` or `getRandomValues` for generating unique identifiers, tokens, and file suffixes.
## 2026-09-24 - Error Stack Trace Leaks
**Vulnerability:** Leaking internal application stack traces in production error logs (`src/media/mealShare.ts`).
**Learning:** Returning `error.stack` from caught errors explicitly exposes sensitive internal execution paths or system structures, violating the principle of failing securely.
**Prevention:** Avoid passing or returning `error.stack` in logs or API responses, only log standardized error messages instead.
