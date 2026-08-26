/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * Test-environment bindings.
 *
 * The pool types `env` as `Cloudflare.Env`, an intentionally empty interface for
 * projects to fill in. Filling it from the Worker's own `Env` keeps one
 * definition rather than two that drift.
 *
 * `TEST_MIGRATIONS` exists only here — it is how `vitest.config.ts` hands the
 * migration files, read in Node, to a runtime with no filesystem of its own.
 */

import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import type { Env as WorkerBindings } from "../src/server/types.js";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerBindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
