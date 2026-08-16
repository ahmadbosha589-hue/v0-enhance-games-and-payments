// Hermetic defaults for every test file. Real credentials must never be
// required (or read) by the suite — tests that need Supabase mock the client.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://testproject.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key-000000000000000000"
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key-0000000000"

// Deterministic crypto/date-sensitive behaviour.
process.env.TZ = "UTC"
