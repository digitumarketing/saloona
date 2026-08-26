# Saloona

Customer retention software for Pakistani salons, by [Digitum](https://digitum.pk).

A salon records who came in, what they had done, and what they paid. Saloona turns
that into loyalty points the customer can see on their own phone, and into a list
of the regulars who have quietly stopped coming — with a button to message them
back, from the salon's own WhatsApp number.

Sold as a monthly subscription. The entities are deliberately generic
(`organization`, `location`, `staff`, `customer`, `service`, `visit`, `reward`,
`campaign`), so the same platform can serve dental clinics, spas, pet grooming and
car detailing without a schema rewrite.

---

## Two money paths, never crossed

This is the constraint the whole design hangs off, and it is worth stating before
anything technical.

| | Who pays | Who receives | How |
|---|---|---|---|
| **Subscription** | The salon | Digitum | Recurring card payment |
| **Service payment** | The customer | The salon, directly | Cash, Raast, JazzCash, Easypaisa |

Digitum never touches a salon customer's money. Saloona *records* that a customer
paid; it does not collect it. Likewise, **each salon connects its own WhatsApp
Business number and pays Meta for its own messages** — messages arrive from the
salon's number, and the platform never fronts a shared sender or a shared bill.

---

## Architecture

One Cloudflare Worker serves four surfaces from one deployment:

| Path | What it is | Rendered |
|---|---|---|
| `/` | Marketing, legal, and auth pages | Server, Hono JSX |
| `/app/*` | Owner and staff dashboard | Client, React SPA |
| `/j/:slug/*` | Customer wallet, QR image, printable poster | Client PWA + server |
| `/api/*` | JSON API | — |

```text
src/
  server/          the Worker
    index.ts       entry point: fetch + scheduled
    routes/        HTTP surface, one file per area
    repositories/  every SQL statement in the app lives here
    services/      auth, messaging, campaigns, scheduler
    middleware/    session, tenancy, CSRF
    lib/           db, time, phone, crypto, validation
    views/         server-rendered HTML
  client/          the browser bundles (own tsconfig — React, not Hono JSX)
    app/           dashboard SPA
    wallet/        customer PWA
    lib/           router, data hooks, API client
  shared/          code both halves import: plans, brand, QR, asset paths
migrations/        D1 migrations, applied in order
test/              runs in workerd against a real local D1
```

### Tenant isolation is structural, not remembered

Every tenant-scoped query is written with a `{where}` marker:

```ts
tenantDb.first("select * from customers where id = ? {where}", [id]);
```

`TenantDb` rewrites that into `and organization_id = ?` and supplies the ID from
the session — never from anything the client sent. A developer who forgets the
marker gets a query that returns nothing, rather than one that returns everyone.
`PlatformDb` is the explicit, greppable escape hatch for the handful of genuinely
cross-tenant reads (resolving a public slug, the cron sweep).

`test/tenant-isolation.test.ts` walks every ID-bearing endpoint as a second salon
and asserts a 404. **A new endpoint that takes an ID belongs in that file.**

### D1 is the first database, not a permanent dependency

Every SQL statement lives in `src/server/repositories/`. IDs are prefixed strings
(`cus_…`, `vis_…`) rather than autoincrement integers, timestamps are ISO-8601 UTC
strings, no business logic lives in triggers, and SQLite-only syntax is avoided.
Moving to Postgres means rewriting one directory.

---

## Local setup

Running the app locally needs nothing external — no Meta account, no payment
gateway, no domain. [SETUP.md](SETUP.md) covers the accounts and credentials that
only matter for putting it in front of real salons.

```bash
npm ci
```

```bash
cp .dev.vars.example .dev.vars
```

Generate the encryption key that wraps per-tenant WhatsApp tokens and paste it
into `.dev.vars`:

```bash
openssl rand -base64 32
```

Create the local database:

```bash
npm run d1:migrate:local
```

Run it:

```bash
npm run dev
```

That builds the client bundles once, then starts Wrangler. While working on the
dashboard or wallet, run the watcher in a second terminal so a save rebuilds:

```bash
npm run dev:client
```

### Demo data

An empty database renders the product's best screen — the list of regulars who
have stopped coming — as an empty state. With the dev server running, in another
terminal:

```bash
npm run seed
```

That creates a salon with a full year of plausible history: loyal customers,
customers who are drifting, customers who are long gone, one who has withdrawn
WhatsApp consent, and one who scanned the QR code and never came in. It drives the
real HTTP API, so the data is exactly what the app would have produced itself. It
prints the login details when it finishes.

### Checks

```bash
npm run check
```

Typechecks both halves — the Worker under Hono's JSX and `workers-types`, the
client under React's and the DOM — then runs the test suite inside workerd against
a real local D1.

---

## Deploying

Two secrets, set once, never in `wrangler.toml`:

```bash
npx wrangler secret put ENCRYPTION_KEY
```

```bash
npx wrangler secret put RESEND_API_KEY
```

`ENCRYPTION_KEY` is effectively permanent: rotating it makes every stored WhatsApp
connection unreadable and every salon has to reconnect. Without `RESEND_API_KEY`,
email verification and password resets are logged to the console instead of sent.

Then, from GitHub, run the **Deploy** workflow (`.github/workflows/deploy.yml`).
It typechecks, tests, builds the client, applies D1 migrations, deploys, and
smoke-checks the result. It is manual on purpose: a D1 migration is the one step
here that redeploying the previous commit will not undo.

Repository secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

To deploy from a laptop instead:

```bash
npm run deploy
```

---

## The automation engine

`[triggers]` in `wrangler.toml` drives everything the salon does not have to
remember:

- **every 5 minutes** — drain the outbound WhatsApp queue
- **hourly** — wake up so each organization's daily 09:00 jobs (return reminders,
  birthdays, review requests, at-risk recalculation, retention cleanup) fire at
  09:00 *in its own timezone*, not in UTC

Without those cron triggers the reminder features exist in the database and never
fire. They are not optional.

---

## Before going public

- [ ] Meta Business verification and WhatsApp Cloud API Tech Provider onboarding
      (long lead time — start before the code is finished)
- [ ] Payment gateway merchant KYC for the subscription side
- [ ] Terms, privacy, refund and data-processing pages reviewed by a Pakistani
      lawyer, not just proofread
- [ ] Subscription billing, trial expiry, and dunning — not built yet; the
      Settings "change plan" button currently emails sales
- [ ] Pilot with 2–3 real salons before opening signups
