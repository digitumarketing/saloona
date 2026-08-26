# What you need, and in what order

Written to answer one question: *what is required from me so I can test this myself?*

Short version: **to run the whole app on your own laptop, nothing external at all.**
No Meta account, no payment gateway, no domain. Everything below the first section
is only needed to put it in front of real salons.

---

## 1. Test it on your Mac — needs nothing from anyone

You already have Node 24 and npm 11 installed, which is everything the app needs.

```bash
npm ci
```

Create your local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

Generate an encryption key and paste it after `ENCRYPTION_KEY=` in `.dev.vars`:

```bash
openssl rand -base64 32
```

Create the local database:

```bash
npm run d1:migrate:local
```

Start the app:

```bash
npm run dev
```

Leave that running. In a **second terminal**, fill it with demo data:

```bash
npm run seed
```

It prints a login email and password when it finishes. Open
`http://localhost:8787` — that's the marketing site; `/login` gets you into the
dashboard, and the seed also prints the customer-facing QR link.

### What you can actually test this way

Everything the salon touches: signup, the reception checkout with multi-service
bills, customer records and visit history, loyalty points and rewards, the
at-risk "lost customers" list with win-back campaigns, staff and service reports,
the QR poster, and the customer wallet PWA on your phone (open the printed
`/j/...` link).

### What will look "broken", and is not

| You'll see | Why | Needs |
|---|---|---|
| Messages sit in the outbox as **queued** | No WhatsApp number is connected, and the platform will never send from its own | Section 5 |
| Verification and reset emails don't arrive — they print in the terminal instead | No email provider configured | Section 4 |
| "Change plan" opens an email draft | Subscription billing isn't built yet | Section 6 |

---

## 2. Push to GitHub — what I need from you

The repo is already wired to `github.com/digitumarketing/saloona` on branch
`main`. Two things I need before I push anything:

1. **Confirmation that pushing is authorised**, and whether the `gh` CLI on this
   machine is signed in with push access to that repo. If not, I'll commit and
   you run the push.
2. **A decision on how**: I want to push a **branch and open a pull request**, not
   push straight to `main`.

That second point is not ceremony — it solves a real problem. I have not been able
to run `npm run typecheck` or `npm test` locally at all this session; the sandbox
keeps refusing to run anything that isn't a plain file read. **GitHub Actions can
run them for me.** `.github/workflows/ci.yml` runs the typecheck for both halves of
the app, the test suite in a real Cloudflare runtime against a real D1 database,
and the production build — on every pull request.

So the pull request is how we find out whether the code compiles. Expect the first
CI run to fail on type errors; that is normal for code this size that has never
been compiled, and fixing them is fast once I can see the list.

---

## 3. Deploy to Cloudflare — what I need from you

Only after CI is green.

**Two GitHub repository secrets** (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_ACCOUNT_ID` — on the right-hand side of any page in the Cloudflare
  dashboard
- `CLOUDFLARE_API_TOKEN` — Cloudflare dashboard → My Profile → API Tokens →
  Create Token → Custom, with these permissions:
  - Account · Workers Scripts · **Edit**
  - Account · D1 · **Edit**

**Two Worker secrets**, set once from your machine:

```bash
npx wrangler secret put ENCRYPTION_KEY
```

```bash
npx wrangler secret put RESEND_API_KEY
```

Generate a **different** key for production than your local one. Save it in a
password manager the moment you create it: this key wraps every salon's WhatsApp
access token, and if it is lost, every salon has to reconnect. There is no
recovery.

**One thing to confirm:** `wrangler.toml` expects a D1 database named `saloona`
with id `7b38c132-6a23-4d89-a3f2-08a72b2ae079`. Check it exists in your account.
If not, `npm run d1:create` makes one and prints a new id to paste in.

### Also worth knowing

The production Worker currently deployed is the **old** code, which scoped tenants
by a header the browser could set — meaning anyone could read any salon's data.
The new deploy replaces it. Since there are no real salons yet, the practical
exposure is limited to whatever fake accounts exist there. If you'd rather not
wait for CI, delete the Worker from the Cloudflare dashboard now; the deploy
recreates it.

Deploys are **manual on purpose** — Actions tab → Deploy → Run workflow. A deploy
applies database migrations, and a migration is the one thing here that
redeploying the previous commit cannot undo.

---

## 4. Email — Resend

Needed for: email verification and password reset.

- Create a free account at [resend.com](https://resend.com) (3,000 emails/month
  free, enough for a long time)
- Verify a sending domain — `digitum.pk` or the Saloona domain. This means adding
  DNS records; without a verified domain you can only send to your own address
- Put the API key in `RESEND_API_KEY`

**Not a launch blocker.** Login does not require a verified email, so salons can
sign up and work without it. But password reset silently does nothing, which means
every forgotten password becomes a phone call to you. Worth doing before the pilot.

---

## 5. WhatsApp — Meta. Start this first, it takes the longest

This is the critical path and the only item measured in weeks rather than minutes.
Start it now, in parallel with everything else.

### To test WhatsApp yourself, today (about 20 minutes, free)

Meta gives every developer app a free test number with no business verification:

1. [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App
   → type **Business**
2. Add the **WhatsApp** product to it
3. The WhatsApp → API Setup page shows a test phone number and gives you:
   - **Phone number ID** (a long number — not the phone number itself)
   - **WhatsApp Business Account ID**
   - A **temporary access token**, valid 24 hours
4. On the same page, add your own mobile number to the recipient list and confirm
   the code Meta sends you
5. In Saloona: Settings → WhatsApp → paste all four values

Real messages will now arrive on your phone. The 24-hour token expiry is why this
is a test setup and not a production one.

### For real salons

Each salon connects **its own** number and pays Meta for **its own** messages —
that is deliberate, and it is why the platform never fronts a shared sender or a
shared bill. What that requires per salon:

- A Meta Business account, business-verified (documents; days to weeks)
- A WhatsApp Business Account with a phone number **not currently registered on
  regular WhatsApp** — this catches people out constantly, and moving a number off
  the consumer app is a one-way step
- A permanent system-user access token
- **Message templates submitted and approved** in that salon's account. Saloona's
  reminder, birthday, win-back and review-request messages are all templates;
  until they are approved, nothing sends

Realistically, no salon owner will do this alone. Plan on Digitum doing it as part
of paid onboarding — which is a fine model here, but it means your setup time per
customer is real and should be priced in.

---

## 6. Not built yet — don't test for these

- **Subscription billing.** No trial expiry paywall, no recurring charge, no
  invoices, no dunning. Salons can sign up and use everything forever, free. This
  is the biggest remaining gap between the app and a business.
- **Booking and appointments.** Deferred to v1.1 by your own scope decision. The
  database table exists; there is no UI.
- **Referrals.** Same — v1.1.
- **Super-admin console.** No way to see all organizations, suspend one, or check
  who is paying.

---

## The order I'd do it in

1. Run section 1 tonight and click through the app. That costs nothing and tells
   you whether the product is right.
2. Start Meta business verification (section 5) — it is the long pole and it does
   not depend on any code being finished.
3. Tell me to push, so CI compiles the code and we find out what breaks.
4. Resend, then deploy.
5. Then billing, because without it there is no revenue.
