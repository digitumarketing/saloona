#!/usr/bin/env node
/**
 * Seeds a local database with a demo salon that has a *history*.
 *
 * The history is the point. Saloona's headline screen is a list of regulars who
 * have quietly stopped coming, and that list is computed from each customer's own
 * visit cadence — so a database of freshly created customers with no visits
 * renders the product's best feature as an empty state. This script produces
 * customers who are loyal, customers who are slipping, customers who are long
 * gone, one who has opted out of WhatsApp, and one who scanned the QR code and
 * never came in. Every panel on the dashboard has something true to show.
 *
 * It drives the real HTTP API rather than writing SQL directly. That costs a
 * running dev server and buys correctness for free: real password hashing (PBKDF2
 * at 210,000 iterations — not something a .sql file can fake), real validation,
 * real loyalty arithmetic, real cadence recomputation. A SQL seed would drift out
 * of date the first time a column moved.
 *
 * Usage:
 *   npm run dev      # one terminal
 *   npm run seed     # another
 *
 * Override the target with SEED_BASE_URL. Pointing it at production would create
 * a fake salon in the real database, so it defaults to localhost and is never
 * called by CI.
 */

const BASE = (process.env.SEED_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

const OWNER = {
  businessName: "Glow Studio",
  ownerName: "Sana Iqbal",
  email: "owner@glowstudio.test",
  phone: "03001112233",
  password: "demo-password-1234",
  planId: "growth",
  city: "Lahore"
};

/**
 * A fixed-seed PRNG, so two runs of this script produce byte-identical data.
 * Screenshots stay comparable and "did my change break the dashboard?" stops
 * being confounded by the seed reshuffling itself.
 */
function rng(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20260826);
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));

const NOW = Date.now();
const DAY = 86_400_000;

/**
 * A plausible instant `daysAgo` days back, during salon opening hours.
 *
 * The hour is chosen in UTC between 06:00 and 15:00, which is 11:00 to 20:00 in
 * Asia/Karachi — the timezone every organization created here runs in. Visits
 * timestamped at 03:00 local would make the "busiest hours" numbers nonsense.
 */
function visitedAt(daysAgo) {
  const date = new Date(NOW - daysAgo * DAY);
  date.setUTCHours(between(6, 15), between(0, 59), 0, 0);
  return date.toISOString();
}

const SERVICES = [
  { name: "Haircut & Styling", category: "Hair", durationMinutes: 45, pricePkr: 2500 },
  { name: "Hair Wash & Blow Dry", category: "Hair", durationMinutes: 30, pricePkr: 1500 },
  { name: "Hair Colour", category: "Hair", durationMinutes: 120, pricePkr: 9000 },
  { name: "Keratin Treatment", category: "Hair", durationMinutes: 180, pricePkr: 18000 },
  { name: "Threading", category: "Beauty", durationMinutes: 15, pricePkr: 600 },
  { name: "Signature Facial", category: "Skin", durationMinutes: 60, pricePkr: 4500 },
  { name: "Manicure & Pedicure", category: "Nails", durationMinutes: 75, pricePkr: 3500 },
  { name: "Party Makeup", category: "Makeup", durationMinutes: 90, pricePkr: 12000 },
  { name: "Bridal Package", category: "Makeup", durationMinutes: 240, pricePkr: 65000 },
  { name: "Head Massage", category: "Wellness", durationMinutes: 30, pricePkr: 1200 }
];

const STAFF = [
  { name: "Ayesha Malik", role: "Senior Stylist", phone: "03211000001" },
  { name: "Hina Raza", role: "Colour Specialist", phone: "03211000002" },
  { name: "Fatima Sheikh", role: "Beautician", phone: "03211000003" },
  { name: "Zainab Ali", role: "Nail Technician", phone: "03211000004" },
  { name: "Maryam Yousaf", role: "Makeup Artist", phone: "03211000005" }
];

const REWARDS = [
  { name: "Free blow dry", pointsRequired: 50, description: "Wash and blow dry on the house." },
  { name: "Free threading", pointsRequired: 30, description: "Eyebrows and upper lip." },
  { name: "20% off any colour service", pointsRequired: 150, description: "One visit, cannot be combined." },
  { name: "Complimentary facial", pointsRequired: 300, description: "Our signature 60-minute facial." }
];

/**
 * Visit-history shapes, and what each one is here to prove.
 *
 * `gapDays` is the customer's own rhythm; `lastDaysAgo` is how long since they
 * were last seen. A customer is at risk when `lastDaysAgo` exceeds their median
 * gap — which is why "occasional" is healthy at 30 days idle while "fading" is
 * overdue at 45. That relative judgement is the whole product, and a seed with
 * only one shape of customer would never demonstrate it.
 *
 * Median gap needs three visits to exist at all, and the at-risk list ignores
 * anyone with fewer than two, so `new` and `prospect` are deliberately below
 * both thresholds.
 */
const ARCHETYPES = {
  loyal: { gapDays: 28, visits: 7, lastDaysAgo: 6 },
  regular: { gapDays: 35, visits: 5, lastDaysAgo: 12 },
  occasional: { gapDays: 75, visits: 3, lastDaysAgo: 30 },
  fading: { gapDays: 21, visits: 4, lastDaysAgo: 45 },
  slipping: { gapDays: 30, visits: 5, lastDaysAgo: 55 },
  lost: { gapDays: 32, visits: 6, lastDaysAgo: 110 },
  new: { gapDays: 0, visits: 1, lastDaysAgo: 3 },
  prospect: { gapDays: 0, visits: 0, lastDaysAgo: 0 }
};

/**
 * `birthdayIn` puts a customer's birthday that many days from today, so the
 * birthday campaign has someone to greet this week instead of next March.
 * `optOut` is exercised once on purpose: a high-spending customer who is overdue
 * but has withdrawn WhatsApp consent must *not* appear in the win-back list, and
 * the only way to trust that is to have such a customer in the demo data.
 */
const CUSTOMERS = [
  { fullName: "Amna Tariq", archetype: "loyal", birthdayIn: 1 },
  { fullName: "Sadia Rehman", archetype: "loyal" },
  { fullName: "Nimra Javed", archetype: "loyal" },
  { fullName: "Bushra Nadeem", archetype: "regular", birthdayIn: 4 },
  { fullName: "Kiran Shahid", archetype: "regular" },
  { fullName: "Rabia Aslam", archetype: "regular" },
  { fullName: "Mehwish Anwar", archetype: "occasional" },
  { fullName: "Sobia Kamran", archetype: "occasional" },
  { fullName: "Farah Siddiqui", archetype: "fading" },
  { fullName: "Iqra Bashir", archetype: "fading" },
  { fullName: "Saba Mehmood", archetype: "slipping" },
  { fullName: "Uzma Qureshi", archetype: "slipping" },
  { fullName: "Nazia Hussain", archetype: "slipping" },
  { fullName: "Shazia Butt", archetype: "lost" },
  { fullName: "Aqsa Waheed", archetype: "lost" },
  { fullName: "Tehmina Akhtar", archetype: "lost" },
  { fullName: "Ruqayya Farooq", archetype: "lost", optOut: true },
  { fullName: "Areeba Sultan", archetype: "new" },
  { fullName: "Hafsa Zubair", archetype: "new" },
  { fullName: "Mahnoor Abbas", archetype: "new", birthdayIn: 2 },
  { fullName: "Laiba Naseer", archetype: "prospect" },
  { fullName: "Eman Rashid", archetype: "prospect" }
];

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

let sessionCookie = null;

/**
 * Every write carries an Origin header matching the host, because the Worker's
 * CSRF middleware rejects unsafe methods that do not — a browser always sends
 * one, so a script pretending to be a browser has to as well.
 */
async function api(method, path, body) {
  const headers = { origin: BASE };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (sessionCookie) headers.cookie = sessionCookie;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}\n${text}`);
  }
  return { data: text ? JSON.parse(text) : null, response };
}

const get = (path) => api("GET", path).then((r) => r.data);
const post = (path, body) => api("POST", path, body).then((r) => r.data);

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function checkServerIsUp() {
  try {
    await fetch(`${BASE}/robots.txt`);
  } catch {
    console.error(`Nothing is answering at ${BASE}.\n\nStart the dev server first:\n\n  npm run dev\n`);
    process.exit(1);
  }
}

/**
 * Signs up the demo salon and returns its organization.
 *
 * Signup answers with `{ ok, redirect }` and nothing else, so the organization —
 * specifically its slug, which the customer-facing URL is built from — comes from
 * the bootstrap call that the dashboard itself makes on load.
 */
async function signUp() {
  const { response } = await api("POST", "/api/auth/signup", { ...OWNER, timezone: "Asia/Karachi" });

  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("sln_session="));
  if (!cookie) throw new Error("Signup succeeded but set no session cookie.");
  sessionCookie = cookie.split(";")[0];

  const { organization } = await get("/api/bootstrap");
  return organization;
}

async function seedCatalog() {
  const services = [];
  for (const service of SERVICES) {
    const { service: created } = await post("/api/services", service);
    services.push(created);
  }

  const staff = [];
  for (const member of STAFF) {
    const { staff: created } = await post("/api/staff", member);
    staff.push(created);
  }

  for (const reward of REWARDS) {
    await post("/api/rewards", reward);
  }

  return { services, staff };
}

/**
 * Phone numbers are allocated from the index rather than randomly: phone is the
 * customer's identity in this system, and a collision would fail the run halfway
 * through with a confusing uniqueness error.
 */
function phoneFor(index) {
  const networks = ["300", "301", "321", "333", "345"];
  const network = networks[index % networks.length];
  return `0${network}${String(4000000 + index * 137).padStart(7, "0")}`;
}

function birthdayFor(daysFromNow) {
  const date = new Date(NOW + daysFromNow * DAY);
  const year = between(1985, 2001);
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The visit days for one customer, oldest first.
 *
 * Intermediate visits get a few days of jitter so the median gap looks like a
 * real person's rather than a metronome's, but the most recent visit lands
 * exactly on `lastDaysAgo`. That keeps the at-risk verdict deterministic: jitter
 * on the last visit could push a customer across the overdue line and quietly
 * change what the demo shows.
 */
function visitDays({ gapDays, visits, lastDaysAgo }) {
  const days = [];
  for (let i = 0; i < visits; i += 1) {
    const jitter = i === 0 ? 0 : between(-4, 4);
    days.push(lastDaysAgo + gapDays * i + jitter);
  }
  return days.sort((a, b) => b - a);
}

async function seedCustomers({ services, staff }) {
  const created = [];

  for (const [index, spec] of CUSTOMERS.entries()) {
    const { customer } = await post("/api/customers", {
      fullName: spec.fullName,
      phone: phoneFor(index),
      consentWhatsapp: true,
      ...(spec.birthdayIn === undefined ? {} : { birthday: birthdayFor(spec.birthdayIn) })
    });

    const archetype = ARCHETYPES[spec.archetype];

    // Chronological order matters: each checkout recomputes the customer's
    // cadence from the history that exists at that moment, exactly as it would
    // on a real reception desk.
    for (const daysAgo of visitDays(archetype)) {
      const lineItems = [pick(services)];
      if (random() < 0.35) {
        const second = pick(services);
        if (second.id !== lineItems[0].id) lineItems.push(second);
      }

      await post("/api/visits", {
        customerId: customer.id,
        items: lineItems.map((service) => ({
          serviceId: service.id,
          staffId: pick(staff).id,
          quantity: 1,
          unitPricePkr: service.price_pkr ?? service.pricePkr,
          discountPkr: random() < 0.15 ? pick([200, 500, 1000]) : 0
        })),
        paymentMethod: pick(["cash", "cash", "cash", "jazzcash", "easypaisa", "raast", "card"]),
        visitedAt: visitedAt(daysAgo)
      });
    }

    // The checkout endpoint already recomputes cadence, but it does so after the
    // response in `waitUntil`. Asking for it explicitly removes the race, so the
    // at-risk list is correct the moment this script exits.
    if (archetype.visits > 0) {
      await post(`/api/customers/${customer.id}/recompute`, {});
    }

    if (spec.optOut) {
      await post(`/api/customers/${customer.id}/opt-out`, {});
    }

    created.push(customer);
  }

  return created;
}

// ---------------------------------------------------------------------------

async function main() {
  await checkServerIsUp();

  console.log(`Seeding ${BASE}\n`);

  let organization;
  try {
    organization = await signUp();
  } catch (error) {
    if (String(error).includes("409") || String(error).toLowerCase().includes("already")) {
      console.error(
        `${OWNER.email} already exists — this database has been seeded.\n\n` +
          `To start over, stop the dev server, delete the local database, and re-migrate:\n\n` +
          `  rm -rf .wrangler/state/v3/d1\n  npm run d1:migrate:local\n`
      );
      process.exit(1);
    }
    throw error;
  }

  console.log(`  organization  ${organization.name} (${organization.slug})`);

  const catalog = await seedCatalog();
  console.log(`  catalog       ${catalog.services.length} services, ${catalog.staff.length} staff, ${REWARDS.length} rewards`);

  const customers = await seedCustomers(catalog);
  console.log(`  customers     ${customers.length}`);

  const atRisk = await get("/api/customers/at-risk");
  const bootstrap = await get("/api/bootstrap");
  console.log(`  visits        ${bootstrap.summary?.month?.visits ?? "?"} this month`);
  console.log(`  at risk       ${atRisk.customers.length} customers\n`);

  console.log("Sign in at");
  console.log(`  ${BASE}/login`);
  console.log(`  ${OWNER.email} / ${OWNER.password}\n`);
  console.log("Customer side (this is what the QR code opens)");
  console.log(`  ${BASE}/j/${organization.slug}`);
  console.log(`  ${BASE}/j/${organization.slug}/poster    printable QR card\n`);
  console.log(
    "The outbox will show queued thank-you messages. They stay queued until a\n" +
      "WhatsApp Business number is connected in Settings, which is the correct\n" +
      "behaviour — the platform never sends on a salon's behalf from its own number."
  );
}

main().catch((error) => {
  console.error(`\nSeed failed.\n\n${error.message ?? error}\n`);
  process.exit(1);
});
