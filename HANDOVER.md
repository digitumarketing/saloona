# Saloona — project handover and go-live plan

**Written:** 27 August 2026
**Repository:** https://github.com/digitumarketing/saloona
**Purpose of this file:** hand it to a fresh Claude session (or a new developer) so they can carry the project to public launch without re-deriving any decision made so far. Read this first, then [README.md](README.md) for architecture and [SETUP.md](SETUP.md) for what has to be obtained from Meta, Cloudflare and the payment gateways.

If you are an AI assistant picking this up: everything in **§1 Binding decisions** has already been settled with the owner. Do not reopen those. Everything in **§4 Where the code stands** is verified fact — the distinction between "traced and believed correct" and "actually executed" is marked explicitly, and it matters.

---

## 1. Binding decisions — settled, do not reopen

These came out of a long design conversation with the owner and three explicit decision points. They constrain everything else.

| Decision | Answer |
|---|---|
| Product | Pakistan-first multi-tenant salon **retention** SaaS, sold by Digitum as a monthly subscription |
| UI stack | **Hono server-rendered shell + React SPA** (not Next.js, not a separate frontend deploy) |
| v1 scope | **CRM + loyalty + WhatsApp.** Booking and referrals deferred to v1.1 |
| Brand | **Saloona is final** |
| Pricing | **PKR 3,999 / 7,999 / 14,999** per month — final. Encoded in [src/shared/plans.ts](src/shared/plans.ts) |
| Hosting | GitHub → **Cloudflare Workers + D1**. Explicitly **not** Supabase |
| Customer app | **PWA reached by QR code.** No App Store, no Play Store, no password |

### The two money paths must never cross

This is the single most important product constraint and it is easy to break by accident.

1. **Business → Digitum**: the monthly subscription. This is Digitum's revenue.
2. **Customer → Business**: JazzCash / Easypaisa / Raast / cash, paid at the salon.

**Digitum must never receive customer transaction money.** The app records what a customer paid the salon; it never routes that money. Any feature that would put Digitum in the middle of path 2 is out of scope, permanently — it would turn a software subscription into a regulated payments business.

### Each salon pays its own messaging cost

Every organization connects **its own** WhatsApp Business number and its own Meta credentials. Messages must appear to come from the salon's number, and Meta bills the salon, not Digitum. Credentials are stored per-tenant, AES-GCM sealed, verified against Meta before saving, and never returned to the client. See [src/server/services/whatsapp.ts](src/server/services/whatsapp.ts).

Digitum bearing the messaging cost would destroy the unit economics at any of the three price points. This is not a technical preference.

### The schema stays generic

Naming is deliberately industry-neutral — `organization`, `location`, `staff`, `customer`, `service`, `visit`, `reward`, `appointment`, `campaign`, `message`. Nothing says "salon" in the data model. This is so the same platform can later serve dental clinics, spas, pet grooming and car detailing without a migration. **Do not introduce salon-specific column or table names.**

### D1 is the first database, not a permanent dependency

- All data access goes through a repository layer ([src/server/repositories/](src/server/repositories/))
- Avoid SQLite-only features
- No business logic in triggers
- Prefixed UUID-style IDs generated in application code ([src/server/lib/ids.ts](src/server/lib/ids.ts))
- All timestamps stored UTC ISO8601

### The killer features

The reason a salon owner pays every month:

1. **Lost Customers** — an at-risk list with a single **[Send Win-Back Campaign]** button
2. **Per-customer visit cadence** — median gap between visits, so "overdue" means overdue *for that person*, not a global 30-day window. Deliberately statistics, not AI, in v1

Recovered revenue is attributed conservatively in [analytics.ts](src/server/repositories/analytics.ts) — only a recorded, completed visit inside the attribution window counts. That number is what justifies the subscription, so it must never be inflated.

---

## 2. Architecture at a glance

```
Browser
  ├── Marketing pages, /login, /signup       → Hono JSX, server-rendered
  ├── /app/*  dashboard                      → React 19 SPA  (src/client/app)
  └── /j/:slug/*  customer wallet PWA        → React 19 SPA  (src/client/wallet)
       ↑ reached by QR code at the reception desk

Cloudflare Worker  (src/server/index.ts)
  ├── middleware/auth.ts     session → TenantDb, CSRF, roles
  ├── routes/api/*           dashboard API, all behind requireAuth
  ├── routes/public.ts       the only unauthenticated tenant-data routes
  ├── services/*             auth, whatsapp, campaigns, messaging, scheduler
  └── repositories/*         all SQL lives here

Cloudflare D1 (SQLite)  +  Cron Triggers (*/5 and hourly)
```

**Two build outputs, one deploy:** Wrangler bundles the Worker from `src/server/index.ts`; Vite bundles the two browser entries into `dist/client`, which `wrangler.toml` serves as `[assets]`. Asset filenames are **not** content-hashed — the Worker builds URLs from [src/shared/assets.ts](src/shared/assets.ts) at request time and cannot read a Vite manifest. Cache busting is the explicit `ASSET_VERSION` query string. Bump it when you ship client changes.

### Tenant isolation is structural

This is the part to understand before touching any query.

The build this replaced trusted a client-supplied `x-organization-id` header, so any salon could read any other salon's customers. The fix is not a patch, it is a shape:

- `TenantDb` cannot be constructed without an organization id that came from a **verified session**
- Repositories only ever receive a `TenantDb`
- Every tenant-scoped query must contain a `{where}` marker, which `TenantDb` rewrites into `organization_id = ?` and binds **itself**. A query missing the marker throws at development time
- `{where:alias}` handles joins where the column would be ambiguous
- `PlatformDb` is the explicit, auditable escape hatch for genuinely cross-tenant work: login lookup by email, cron jobs, super-admin reporting

There is no code path that reads tenant data without a tenant scope. See [src/server/lib/db.ts](src/server/lib/db.ts).

`organizations` is the one exception — its primary key *is* the tenant id, so it has no `organization_id` column and the marker cannot apply. Use `TenantDb.organizationRow()` and `TenantDb.updateOrganization()`, which supply the id themselves.

---

## 3. What was done, and what was found

The code was written across several sessions and had **never been compiled or executed**. Roughly 25,000 lines. Getting it to build and run was this session's work, and it surfaced two real bugs that static review had missed.

### Fixed: 53 TypeScript errors

48 of them had one root cause. Four route files typed their helpers as:

```ts
function service(c: Parameters<Parameters<typeof route.get>[1]>[0])
```

`Parameters<T>` on an **overloaded** function resolves to the last overload only. Hono's `.get` ends with `(path: string)` — a 1-tuple — so `[1]` is `undefined` and every type downstream collapsed to `never`. Replaced with the correct idiom, `Context<AppEnv>` and `MiddlewareHandler<AppEnv>`, in [campaigns.ts](src/server/routes/api/campaigns.ts), [customers.ts](src/server/routes/api/customers.ts), [auth.ts](src/server/routes/auth.ts) and [public.ts](src/server/routes/public.ts).

The remaining five: `DatabaseError` redeclaring the built-in `Error.cause` (TS4115, rejected under `noImplicitOverride`); `RenderOptions.children` typed `unknown` instead of Hono's `Child`; `sealCredentials` accepting `Record<string, unknown>`, which declared interfaces are not assignable to; and an `inputmode` prop typed as a bare `string`.

### Fixed: the runtime would not boot

```
This Worker requires compatibility date "2026-08-25", but the newest date
supported by this server binary is "2026-08-22"
```

A `compatibility_date` is a pin to a runtime behaviour snapshot and must be **≤** what the installed `workerd` supports. Lowered to `2026-08-22` in both [wrangler.toml](wrangler.toml) and [vitest.config.ts](vitest.config.ts) — they must always match. Lowering was chosen over upgrading dependencies because a lower date is safe in every environment and this Worker declares no `compatibility_flags`. This also unblocked `npm run dev`, which had never started.

### Fixed: CSRF blocked every write in the test suite

All five tests failed with `403 csrf_blocked "missing origin"` — and the test helper was already sending an `Origin` header. The real cause: `SELF.fetch` builds a synthetic request with **no `Host` header**, and the middleware compared origin against `Host` while reporting both failures with the same message.

Now it compares against `new URL(c.req.url).host` — which workerd always populates from what Cloudflare actually routed on — while still honouring `Host` when present, since a proxy can rewrite one without the other. The three failure modes (missing origin / invalid origin / origin mismatch) now report distinctly, so the next CSRF failure diagnoses itself. Fixed in the middleware, **not** in the test.

### Fixed: `no such column: organization_id` on `organizations`

The settings repository applied the `{where}` marker to the one table that has no such column. Added `organizationRow()` and `updateOrganization()` to `TenantDb` and updated four call sites.

### Fixed — and this one was a live security hole

`TenantDb.scope()` appended the tenant id to the **end** of the parameter list:

```ts
params: [...params, this.organizationId]     // wrong
```

The `{where}` marker usually sits last, where end-of-list and marker-position coincide. But **every paginated read** ends `... {where} order by ... limit ?`, and several others have a trailing predicate. In those, the tenant id landed in the wrong slot and every later value shifted by one.

When the types differed, SQLite raised `SQLITE_MISMATCH` — which is how it was caught. **When the types happened to agree, it silently compared `organization_id` against whatever the caller passed next.** That defeats the entire mechanism the class exists to provide.

The fix binds at the marker's own placeholder index:

```ts
const position = (preceding.match(/\?/g) ?? []).length;
params: [...params.slice(0, position), this.organizationId, ...params.slice(position)]
```

No caller could have been written to compensate for the old behaviour, because callers never pass the org id themselves — so splicing is correct everywhere, with no audit of individual queries needed.

**This bug was pushed to GitHub and is in the currently deployed Worker.** Exposure is limited only because there are no real salons on it yet. See §7.

### Fixed: the rate limiter was failing the tests, correctly

Three tests failed with `429 Too many signup attempts`. `signupByIp` allows 5 per hour, the suite registers **ten** salons, and every test request arrived with no `cf-connecting-ip` — so all ten collapsed onto the single key `signupByIp:unknown`.

Fixed the **harness**, not the limiter: [test/helpers.ts](test/helpers.ts) now gives each tenant its own address from `203.0.113.0/24` (the RFC 5737 documentation range, which routes nowhere). Real salons sign up from their own connections, so the tests now do too. Weakening a production abuse control to make a test pass would have traded away real protection for nothing.

The cumulative hit pattern (signups 1–5 pass, 6 blocked) also proves **storage is not reset between tests**, despite a comment in [test/setup.ts](test/setup.ts) implying isolation. Worth revisiting if tests later interfere, but the suite is written to tolerate it (unique index is `(organization_id, phone)`, and emails/slugs derive from the tenant index).

---

## 4. Where the code stands — precisely

| Item | State |
|---|---|
| `npm run typecheck` | ✅ **Passes clean**, both halves (Worker under Hono JSX + workers-types; client under React + DOM) |
| Test runtime boots | ✅ Yes, after the compatibility-date fix |
| `npm test` | 🟡 **2 of 5 passing** as of the last executed run. The 3 remaining failures were all the signup 429, which the helper fix addresses — **re-run required to confirm** |
| `npm run build` | ⬜ **Never attempted.** Config and both entry points verified present, names match the `assets.ts` contract, but Vite + Tailwind 4 bundling is an unexercised path |
| Local commits | ⬜ **Not committed.** 11 source files changed since commit `43d3ecc`, plus this document |
| Pull request | ⬜ **Does not exist** |
| CI | ⬜ **Has never run.** `ci.yml` triggers on `pull_request` and `push: main`; the push to `fix/security-foundation` matched neither. This is why the Actions tab shows "0 workflow runs" |
| Deployed Worker | ⚠️ Old, **contains the tenant-isolation bug from §3** |

Current branch: `fix/security-foundation`. Remote `origin/main` is at `738cf8f`.

### The two tests that pass

Both are the ones that matter most:

- *"hides every one of another salon's records behind a 404"* — seeds one salon with a customer, service, staff member, reward, visit and campaign, then as a second salon walks **12 write endpoints and 4 read endpoints** with those IDs and asserts 404 on every one. It also re-reads the record afterwards as the owner, because a 404 returned *after* a successful UPDATE is still a successful UPDATE
- *"keeps list endpoints empty for a salon that has created nothing"*

### The three that have never executed a single assertion

They died at signup, so their bodies are genuinely unproven. All three were traced against the source and are expected to pass, but traced is not run:

- *"reports zero on the dashboard"* — every aggregate is doubly defended (`coalesce()` in SQL plus `?? 0` in JS, and `??` catches the `null` that `sum(case when …)` returns on an empty table), so `toBe(0)` should hold
- *"refuses to redeem one salon's reward against another salon's customer"* — all three mixed cases raise `NotFoundError` → 404, with the customer checked before the reward so there is no insufficient-points information leak
- *"does not expose a customer wallet through another salon's join slug"* — the wallet lookup is `{where}`-scoped, so a foreign token returns 401

**When a new ID-bearing endpoint is added, it belongs in [test/tenant-isolation.test.ts](test/tenant-isolation.test.ts).** An untested route is where the next `x-organization-id` will hide.

---

## 5. Go-live plan

### Step 1 — finish verification (no external dependencies)

```bash
cd path/to/saloona && npm run check && npm run build
```

`check` is typecheck + tests. If both pass, `build` produces `dist/client`. Fix whatever this surfaces before going further — do not skip to deploying because typecheck passes.

### Step 2 — commit and open the PR

```bash
git add -A && git commit -m "Fix compilation, tenant-scoping parameter bug, and CSRF host comparison" && git push
```

Then open the PR on GitHub: **Code tab → branch dropdown → Contribute → Open pull request**, or the `/branches` page → "New pull request". Avoid hand-typing a `compare/` URL — the `/` in the branch name breaks it.

Opening the PR is what finally triggers CI. **Do not merge until it is green.**

### Step 3 — deploy

Requires the owner's explicit go-ahead. It has **not** been given yet.

Deployment is `.github/workflows/deploy.yml`, `workflow_dispatch` only — manual on purpose, because it applies D1 migrations to production and a migration is the one thing in the pipeline that redeploying the previous commit cannot undo. The workflow re-runs typecheck and tests on the dispatched ref (a manual dispatch can target a ref that never opened a PR), builds the client bundles **before** deploying (an unbuilt `dist/client` ships a Worker whose every script 404s), applies migrations, deploys, then smoke-checks five URLs.

Needs two GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Needs one Worker secret, set with `wrangler secret put` and never in `wrangler.toml`:

```bash
openssl rand -base64 32
```

→ `ENCRYPTION_KEY`. This wraps every tenant's WhatsApp token. **Rotating it makes every stored WhatsApp connection unreadable and forces every salon to reconnect. Treat it as permanent.**

Optional: `RESEND_API_KEY` for verification and password-reset email. Unset, mail is logged to console — which is right locally and a silent failure in production. **Set it before real signups.**

### Step 4 — containment for the currently deployed Worker

The live Worker contains the §3 tenant-isolation bug. Until the fix ships, either delete the Worker from the Cloudflare dashboard (the next deploy recreates it) or accept the risk on the grounds that no real salon data is on it. Do not onboard a pilot salon onto the current deployment.

---

## 6. What is not built

Do not tell the owner the app is launch-ready until §6.1 exists. It is the difference between software and a business.

### 6.1 Monetisation — Phase 5, the real blocker

Nothing here exists. Today the Settings "Change plan" button is a `mailto:hello@digitum.pk`.

- Trial-expiry paywall (trial state is tracked; nothing enforces it)
- Safepay recurring subscriptions **with webhook signature verification** — an unverified webhook endpoint that grants plan access is a free-subscription exploit
- Invoices
- Dunning for failed payments
- Super-admin console: view organizations, suspend, refund, inspect usage

Until this ships, Saloona can acquire users but cannot charge them.

### 6.2 Operational — Phase 1 remainder

- Staging environment (there is only production)
- Error tracking. `[observability]` is on in `wrangler.toml`, but nothing alerts anyone
- Backup and restore runbook, actually rehearsed
- Load test

### 6.3 Marketing polish — Phase 6

- Real product screenshots (currently placeholders)
- Blog

### 6.4 Launch readiness — Phase 7

- **Legal review by a Pakistani lawyer** — terms, privacy policy, data-protection posture
- Consent records: prove, per customer, when and how WhatsApp consent was given. Meta and PECA both matter here
- Monitoring and on-call
- Security review
- **Pilot with 2–3 real salons before public launch**

---

## 7. Risks a fresh session must not get wrong

1. **The deployed Worker has a tenant-isolation bug.** §3, last item. Ship the fix or take it down before anyone real touches it.
2. **Never weaken a rate limit or an auth control to make a test pass.** The 429 in §3 was the product working. Fix the harness.
3. **`wrangler.toml` and `vitest.config.ts` compatibility dates must match**, and both must be ≤ the installed workerd.
4. **Bump `ASSET_VERSION`** in [src/shared/assets.ts](src/shared/assets.ts) when client bundles change, or browsers serve stale JS against new API shapes.
5. **`npm run build` before any deploy.** `wrangler deploy` uploads `dist/client` as-is.
6. **Do not read payload shapes from assumption.** Two bugs in `scripts/seed.mjs` came from assuming signup returns `{organization}` and that visit counts live at `bootstrap.month.visits` rather than `summary.month.visits`. Read the server route first.
7. **Digitum must never touch customer transaction money.** §1.
8. **Do not add salon-specific names to the schema.** §1.
9. `[assets]` has `html_handling = "none"` and `not_found_handling = "none"` deliberately. Every HTML page is Worker-rendered; asset-store fallbacks would shadow real routes.

---

## 8. Owner action items — start now, in parallel with development

These have long lead times and are on the critical path. Nothing in §5 blocks them and they block launch.

1. **Meta Business verification + WhatsApp Business API onboarding.** Longest lead time of anything in this project. Start first. Per [SETUP.md](SETUP.md), a personal test number can be connected in ~20 minutes for free to exercise the flow end to end
2. **Payment gateway merchant KYC** — Safepay for Business → Digitum subscriptions
3. **Engage a Pakistani lawyer** for terms, privacy policy and consent posture
4. **Line up 2–3 pilot salons** who will tolerate rough edges and give real feedback

---

## 9. Command reference

```bash
npm run dev                  # vite build + wrangler dev — full app locally
npm run typecheck            # both tsconfigs
npm test                     # vitest in workerd against a real local D1
npm run check                # typecheck + test
npm run build                # client bundles → dist/client
npm run seed                 # demo data via the HTTP API
npm run d1:migrate:local     # apply migrations locally
npm run d1:migrate:remote    # apply migrations to production
npm run deploy               # build + wrangler deploy (prefer the GitHub workflow)
```

Local secrets: `cp .dev.vars.example .dev.vars` and fill in. `.dev.vars` is gitignored.
