/** Shared Worker environment and Hono context types. */

import type { SessionContext } from "./services/auth.js";
import type { TenantDb } from "./lib/db.js";

export interface Env {
  DB: D1Database;
  APP_ENV: string;
  BASE_URL: string;
  /** Optional: set via `wrangler secret put` when messaging is enabled. */
  ENCRYPTION_KEY?: string;
  RESEND_API_KEY?: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    session?: SessionContext;
    db?: TenantDb;
    /**
     * Per-request CSP nonce, set by the `secureHeaders` middleware. Every inline
     * script the Worker emits must carry it, because `script-src` deliberately
     * does not allow `'unsafe-inline'`.
     */
    secureHeadersNonce?: string;
  };
}
