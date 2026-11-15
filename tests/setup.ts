// Database tests run only when TEST_DATABASE_URL points at a throwaway
// Postgres. They never touch DATABASE_URL — that may be the real one.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
