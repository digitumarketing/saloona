## What this changes

<!-- One or two sentences. Why, not just what. -->

## Checklist

- [ ] `npm run check` passes locally (typecheck + tests)
- [ ] `npm run build` passes — the client build is a separate failure mode from typecheck
- [ ] **Any new endpoint that accepts an ID is covered in `test/tenant-isolation.test.ts`.**
      An untested route is where the next cross-tenant leak hides.
- [ ] `ASSET_VERSION` in `src/shared/assets.ts` bumped if client JS or CSS changed,
      or browsers serve stale bundles against new API shapes
- [ ] No tenant-scoped SQL added without the `{where}` marker
- [ ] No rate limit or auth control weakened to make a test pass —
      fix the harness instead

## Verification

<!-- What you actually ran, and what it printed. "Should work" is not verification. -->
