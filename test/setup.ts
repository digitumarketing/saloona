/**
 * Applies D1 migrations before any test runs.
 *
 * This happens in the seed phase, before isolated storage takes its snapshot, so
 * every test starts from a migrated-but-empty database rather than paying for the
 * migrations itself.
 */

import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
