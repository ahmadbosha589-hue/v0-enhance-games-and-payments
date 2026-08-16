import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // Each test file gets a fresh module registry. lib/supabase/server.ts caches
    // a client and lib/supabase/jwt-verify.ts caches the JWKS at module scope,
    // so leaking those between files would make auth tests order-dependent.
    isolate: true,
    restoreMocks: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
