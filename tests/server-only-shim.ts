// Vitest-only shim. Next's `server-only` package throws at import time when it
// thinks it's on the client; in Node-based tests that check is wrong. Swap for
// a no-op so we can import server modules directly.
export {}
