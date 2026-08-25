# Saloona by Digitum

Saloona is a Pakistan-first multi-tenant SaaS for salons and future recurring-service industries. The public brand is centralized in `src/config/brand.js` so copy, pricing, and contact details remain easy to update.

## What is included

- Cloudflare Worker app serving the marketing website, owner dashboard shell, API, customer QR/PWA pages, sitemap, robots, and web manifest.
- Cloudflare D1 migrations for generic organizations, locations, users, staff, customers, services, appointments, visits, rewards, message queue, payments, integrations, and Digitum SaaS subscriptions.
- Repository layer in `src/db/repositories.js` to keep business logic away from D1-specific calls and reduce future Postgres/Supabase migration cost.
- Business-owned WhatsApp abstraction and message queue in `src/services/messages.js`.
- Business-owned payment abstraction for Cash, Raast, JazzCash, and Easypaisa in `src/services/payments.js`.
- Separate Digitum SaaS subscription billing model in `src/services/subscriptions.js`.
- SEO pages: home, features, pricing, industries/salons, about, contact, privacy, terms, refund/cancellation, login, and signup.
- GitHub Actions deployment workflow for Cloudflare Workers and D1 migrations.

## Pricing defaults

- Starter: PKR 3,999/month
- Growth: PKR 7,999/month
- Scale: PKR 14,999/month

Edit `src/config/brand.js` to change names, pricing, support details, and public copy.

## Local setup

```bash
npm install
npm run check
npm run d1:migrate:local
npm run dev
```

Open the Wrangler URL shown in the terminal. Demo data is seeded for `org_demo`.

## Cloudflare setup

1. Create a D1 database:

```bash
npm run d1:create
```

2. Copy the returned `database_id` into `wrangler.toml`.
3. Set `BASE_URL` in `wrangler.toml` to the production domain.
4. Apply migrations:

```bash
npm run d1:migrate:remote
```

5. Deploy:

```bash
npm run deploy
```

## GitHub deployment

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Push to `main`. The workflow in `.github/workflows/deploy.yml` installs dependencies, runs syntax checks, applies D1 migrations, and deploys the Worker.

## API overview

- `POST /api/signup`
- `GET /api/bootstrap`
- `GET/POST /api/customers`
- `GET/POST /api/services`
- `GET /api/staff`
- `GET /api/appointments`
- `POST /api/visits`
- `GET /api/analytics`
- `POST /api/messages`
- `POST /api/payments/manual`
- `POST /api/webhooks/payments/:provider`
- `GET /api/subscription`

Pass `x-organization-id` for tenant-scoped API calls. The demo defaults to `org_demo`.

## Future Postgres/Supabase migration notes

The application is intentionally organized as:

```text
Routes and UI
  -> Repositories and service abstractions
    -> D1 SQL adapter today
    -> Postgres/Supabase adapter later
```

To keep migrations easier:

- IDs are string IDs with prefixes, not database-generated integer IDs.
- Business entities are generic, not salon-only.
- Payment and WhatsApp providers are abstractions.
- SQL avoids D1-only features where practical.
- Tenant access is scoped by `organization_id` across operational tables.

Before a large migration, export D1, transform schema/data for PostgreSQL, validate row counts and relationships, then swap repository implementations.

## Launch checklist

- Replace temporary brand/domain details in `src/config/brand.js` and `wrangler.toml`.
- Configure real authentication before public onboarding.
- Connect WhatsApp Business API provider credentials.
- Complete JazzCash/Easypaisa/Raast provider adapters after merchant approval.
- Add production-grade authorization checks for every API route.
- Review privacy, terms, and refund text with local legal counsel.
