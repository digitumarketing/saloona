/**
 * Test configuration.
 *
 * Tests run inside workerd via `@cloudflare/vitest-pool-workers`, against a real
 * local D1 — not a mock. Tenant isolation is enforced in SQL, so a suite that
 * stubbed the database would prove nothing about the thing most worth proving.
 *
 * Bindings are declared here rather than read from `wrangler.toml` on purpose.
 * The deployed config also declares `[assets]`, pointing at a build output
 * directory that does not exist until `npm run build` has run; the tests must not
 * depend on having built the client first.
 */

import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Read at config time, in Node, then handed to the Worker as a binding — the test
// runtime has no filesystem to read a migrations directory from.
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/server/index.ts",
      miniflare: {
        // Must match `compatibility_date` in wrangler.toml, and must not exceed
        // what the bundled workerd supports.
        compatibilityDate: "2026-08-22",
        d1Databases: ["DB"],
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Not "production": `baseUrl()` then trusts the request origin, which is
          // what makes absolute links in assertions predictable.
          APP_ENV: "test",
          BASE_URL: "http://localhost",
          // A fixed key so encrypted columns round-trip within a run. Test-only,
          // and worthless outside one.
          ENCRYPTION_KEY: "dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb25nISE="
        }
      }
    })
  ],
  test: {
    setupFiles: ["./test/setup.ts"]
  }
});
