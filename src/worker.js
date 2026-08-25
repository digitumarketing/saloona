import { brand, pricingPlans } from "./config/brand.js";
import {
  AnalyticsRepository,
  AppointmentRepository,
  AuthRepository,
  CustomerRepository,
  OrganizationRepository,
  ServiceRepository,
  StaffRepository,
  VisitRepository
} from "./db/repositories.js";
import { MessageQueue } from "./services/messages.js";
import { PaymentService, paymentProviders } from "./services/payments.js";
import { DigitumSubscriptionBilling } from "./services/subscriptions.js";

const demoOrgId = "org_demo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return api(request, env, url);
      if (url.pathname === "/robots.txt") return text(robots(env));
      if (url.pathname === "/sitemap.xml") return xml(sitemap(env));
      if (url.pathname === "/manifest.webmanifest") return json(manifest(env));
      if (url.pathname === "/sw.js") return js(serviceWorker());
      if (url.pathname.startsWith("/customer/")) return html(customerPwa(url, env));
      if (url.pathname.startsWith("/app")) return html(appShell(env));
      return html(marketingPage(url.pathname, env));
    } catch (error) {
      console.error(error);
      return html(page("Something went wrong", `<section class="narrow"><h1>Something went wrong</h1><p>Please try again or contact ${brand.supportEmail}.</p></section>`, env), 500);
    }
  }
};

async function api(request, env, url) {
  const db = env.DB;
  if (!db) return json({ error: "D1 binding DB is not configured." }, 500);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const orgId = await resolveOrganizationId(request, db, body);

  if (url.pathname === "/api/signup" && request.method === "POST") {
    const repo = new OrganizationRepository(db);
    const created = await repo.create({ name: body.businessName || "Demo Salon", ownerEmail: body.email || "owner@example.com", password: body.password, planId: body.planId || "starter" });
    return json(created, 201, { "Set-Cookie": `org=${created.organizationId}; Path=/; HttpOnly; SameSite=Lax; Secure` });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const session = await new AuthRepository(db).login(body.email, body.password);
    if (!session) return json({ error: "Invalid email or password" }, 401);
    return json({ ok: true }, 200, { "Set-Cookie": `session=${session.sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure` });
  }

  if (!orgId) return json({ error: "Login required" }, 401);

  if (url.pathname === "/api/bootstrap") return bootstrap(db, orgId);
  if (url.pathname === "/api/customers") {
    const repo = new CustomerRepository(db);
    if (request.method === "POST") {
      await repo.create(orgId, body);
      return json({ ok: true }, 201);
    }
    return json(await repo.list(orgId));
  }
  if (url.pathname === "/api/services") {
    const repo = new ServiceRepository(db);
    if (request.method === "POST") {
      await repo.create(orgId, body);
      return json({ ok: true }, 201);
    }
    return json(await repo.list(orgId));
  }
  if (url.pathname === "/api/staff") return json(await new StaffRepository(db).list(orgId));
  if (url.pathname === "/api/appointments") return json(await new AppointmentRepository(db).list(orgId));
  if (url.pathname === "/api/visits" && request.method === "POST") return json(await new VisitRepository(db).record(orgId, body), 201);
  if (url.pathname === "/api/analytics") return json(await new AnalyticsRepository(db).summary(orgId));
  if (url.pathname === "/api/messages" && request.method === "POST") return json(await new MessageQueue(db).enqueue({ organizationId: orgId, ...body }), 201);
  if (url.pathname === "/api/payments/manual" && request.method === "POST") return json(await new PaymentService(db).recordManual({ organizationId: orgId, ...body }), 201);
  if (url.pathname.startsWith("/api/webhooks/payments/") && request.method === "POST") {
    const provider = url.pathname.split("/").pop();
    return json(await new PaymentService(db).handleWebhook(provider, body));
  }
  if (url.pathname === "/api/subscription") return json(await new DigitumSubscriptionBilling(db).current(orgId));

  return json({ error: "Not found" }, 404);
}

async function bootstrap(db, orgId) {
  const org = await new OrganizationRepository(db).byId(orgId);
  const analytics = await new AnalyticsRepository(db).summary(orgId);
  const services = await new ServiceRepository(db).list(orgId);
  const customers = await new CustomerRepository(db).list(orgId);
  const staff = await new StaffRepository(db).list(orgId);
  const appointments = await new AppointmentRepository(db).list(orgId);
  const subscription = await new DigitumSubscriptionBilling(db).current(orgId);
  return json({ brand, pricingPlans, org, analytics, services, customers, staff, appointments, subscription, paymentProviders });
}

function marketingPage(path, env) {
  const routes = {
    "/": home,
    "/features": features,
    "/pricing": pricing,
    "/industries/salons": salons,
    "/about": about,
    "/contact": contact,
    "/privacy": privacy,
    "/terms": terms,
    "/refund-cancellation": refund,
    "/login": login,
    "/signup": signup
  };
  const render = routes[path] || notFound;
  return page(render.title, render(env), env, render.schema?.(env));
}

const home = Object.assign(
  () => `
    <section class="hero">
      <div>
        <p class="eyebrow">Pakistan-first salon CRM and loyalty SaaS</p>
        <h1>${brand.productName} helps recurring-service businesses bring customers back.</h1>
        <p class="lede">Manage customers, services, visits, appointments, loyalty rewards, WhatsApp follow-ups, and business payments from one Cloudflare-hosted dashboard.</p>
        <div class="actions"><a class="btn primary" href="/signup">Start free trial</a><a class="btn" href="/pricing">See pricing</a></div>
      </div>
      <div class="hero-panel">
        <strong>Owner dashboard</strong>
        <span>At-risk customers: 28</span>
        <span>Recovered this month: 11</span>
        <span>30-day revenue: PKR 486,500</span>
        <span>WhatsApp queue: 42 reminders</span>
      </div>
    </section>
    <section class="band"><h2>Built for salons first. Designed for every repeat-service business later.</h2><div class="grid">${["Customer records", "QR customer PWA", "Appointments", "Loyalty points", "Recovery analytics", "Payment tracking"].map(card).join("")}</div></section>
  `,
  { title: "Salon CRM, loyalty and appointment SaaS in Pakistan" }
);

const features = Object.assign(
  () => `<section class="narrow"><h1>Features</h1><p class="lede">Everything a recurring-service business needs to retain customers without losing control of its own WhatsApp and payments.</p></section><section class="grid">${[
    "Multi-tenant organizations, locations, staff, customers, services and visits",
    "Owner dashboard with appointments, sales, loyalty and recovery metrics",
    "At-risk customer detection based on last visit behavior",
    "Recovered-customer tracking for campaigns and follow-ups",
    "Customer PWA opened from a QR code at reception or on receipts",
    "Business-owned WhatsApp queue with provider abstraction",
    "Cash, Raast, JazzCash and Easypaisa tracking with webhook stubs",
    "Digitum subscription billing separate from merchant payments"
  ].map(card).join("")}</section>`,
  { title: "Features for salons and recurring-service businesses" }
);

const pricing = Object.assign(
  () => `<section class="narrow"><h1>Pricing</h1><p class="lede">Monthly plans in Pakistani rupees. Start lean, then scale branches, staff, and automation.</p></section><section class="pricing">${pricingPlans.map((plan) => `<article><h2>${plan.name}</h2><p>${plan.summary}</p><strong>PKR ${plan.price.toLocaleString("en-PK")}/mo</strong><small>${plan.limits}</small><ul>${plan.features.map((f) => `<li>${f}</li>`).join("")}</ul><a class="btn primary" href="/signup?plan=${plan.id}">Choose ${plan.name}</a></article>`).join("")}</section>`,
  { title: "Pricing from PKR 3,999 per month" }
);

const salons = Object.assign(
  () => `<section class="narrow"><h1>Salon software for Pakistan</h1><p class="lede">Track every client visit, reward repeat behavior, remind customers on WhatsApp, and identify people who are slipping away before your chairs go empty.</p></section><section class="band"><div class="grid">${["Hair salons", "Beauty parlours", "Barber shops", "Nail studios", "Aesthetic clinics", "Spa services"].map(card).join("")}</div></section>`,
  { title: "Salon CRM and loyalty software in Pakistan" }
);

const about = Object.assign(
  () => `<section class="narrow"><h1>About ${brand.companyName}</h1><p>${brand.productName} is a temporary working brand by ${brand.companyName}, built for Pakistan-first service businesses that rely on repeat customers, branch operations, and local payment behavior.</p></section>`,
  { title: `About ${brand.companyName}` }
);

const contact = Object.assign(
  () => `<section class="narrow"><h1>Contact</h1><p>Email <a href="mailto:${brand.supportEmail}">${brand.supportEmail}</a> or call <a href="tel:${brand.salesPhone.replaceAll(" ", "")}">${brand.salesPhone}</a>.</p><form class="form"><input placeholder="Business name"><input placeholder="Phone"><textarea placeholder="Tell us about your branches"></textarea><button class="btn primary">Send</button></form></section>`,
  { title: "Contact sales and support" }
);

const privacy = Object.assign(
  () => `<section class="legal"><h1>Privacy Policy</h1><p>${brand.companyName} stores business, staff, customer, visit, appointment, message and payment-tracking data to provide the service. Businesses are responsible for obtaining customer consent before sending WhatsApp or marketing messages.</p><p>Data is hosted on Cloudflare infrastructure through Workers and D1. Provider integrations may process data according to their own terms once enabled by the business.</p></section>`,
  { title: "Privacy Policy" }
);

const terms = Object.assign(
  () => `<section class="legal"><h1>Terms of Service</h1><p>${brand.productName} is provided by ${brand.legalName}. Businesses must use the platform lawfully, keep account access secure, and respect customer consent requirements.</p><p>Feature availability may differ by plan, integration approval, and payment provider readiness.</p></section>`,
  { title: "Terms of Service" }
);

const refund = Object.assign(
  () => `<section class="legal"><h1>Refund and Cancellation Policy</h1><p>Subscriptions are billed monthly in advance. Customers may cancel before the next billing cycle. Refund requests are reviewed case by case for duplicate charges, failed onboarding, or service unavailability caused by ${brand.companyName}.</p></section>`,
  { title: "Refund and Cancellation Policy" }
);

const login = Object.assign(
  () => `<section class="narrow"><h1>Login</h1><form class="form" id="login-form"><input name="email" type="email" placeholder="Owner email" required><input name="password" type="password" placeholder="Password" required><button class="btn primary">Open dashboard</button></form></section><script>document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});if(r.ok) location.href='/app'; else alert('Invalid login');});</script>`,
  { title: "Login" }
);

const signup = Object.assign(
  () => `<section class="narrow"><h1>Start your trial</h1><form class="form" id="signup-form"><input name="businessName" placeholder="Business name" required><input name="email" type="email" placeholder="Owner email" required><input name="password" type="password" placeholder="Password" minlength="8" required><select name="planId">${pricingPlans.map((p) => `<option value="${p.id}">${p.name} - PKR ${p.price.toLocaleString("en-PK")}/mo</option>`).join("")}</select><button class="btn primary">Create workspace</button></form></section><script>document.querySelector('#signup-form').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});if(r.ok) location.href='/app'; else alert('Could not create workspace');});</script>`,
  { title: "Sign up for salon CRM" }
);

const notFound = Object.assign(() => `<section class="narrow"><h1>Page not found</h1><p>The page you requested does not exist.</p></section>`, { title: "Page not found" });

function appShell(env) {
  return page(
    "Owner dashboard",
    `<main class="app">
      <aside><strong>${brand.productName}</strong><a href="#overview">Overview</a><a href="#customers">Customers</a><a href="#services">Services</a><a href="#appointments">Appointments</a><a href="#loyalty">Loyalty</a><a href="#payments">Payments</a></aside>
      <section class="workspace">
        <div class="topbar"><h1>Owner Dashboard</h1><a class="btn" href="/customer/demo">Customer QR PWA</a></div>
        <div id="app">Loading...</div>
      </section>
    </main>
    <script>
      async function load(){const r=await fetch('/api/bootstrap');const d=await r.json();document.querySelector('#app').innerHTML=\`
        <div class="stats"><article><b>\${d.analytics.customers}</b><span>Customers</span></article><article><b>PKR \${Number(d.analytics.revenue30d).toLocaleString('en-PK')}</b><span>30-day revenue</span></article><article><b>\${d.analytics.atRisk.length}</b><span>At risk</span></article><article><b>\${d.analytics.recovered.length}</b><span>Recovered</span></article></div>
        <div class="two"><section><h2>At-risk customers</h2>\${rows(d.analytics.atRisk,['full_name','phone','last_visit_at'])}</section><section><h2>Appointments</h2>\${rows(d.appointments,['customer_name','service_name','scheduled_at','status'])}</section></div>
        <div class="two"><section><h2>Customers</h2>\${rows(d.customers,['full_name','phone','loyalty_points','last_visit_at'])}</section><section><h2>Services</h2>\${rows(d.services,['name','category','duration_minutes','price_pkr'])}</section></div>
        <section><h2>Payment providers</h2><div class="chips">\${Object.entries(d.paymentProviders).map(([k,p])=>\`<span>\${p.label}: \${p.kind}</span>\`).join('')}</div></section>\`;
      }
      function rows(items, keys){if(!items?.length)return '<p class="muted">No records yet.</p>';return '<table><tbody>'+items.map(i=>'<tr>'+keys.map(k=>'<td>'+escapeHtml(i[k]??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
      function escapeHtml(v){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
      load();
    </script>`,
    env
  );
}

function customerPwa(url, env) {
  const customerId = url.pathname.split("/").pop();
  return page(
    "Customer rewards",
    `<section class="customer-pwa"><h1>Your rewards</h1><p class="lede">Show this page at the counter to collect points, redeem rewards, or book your next visit.</p><div class="qr">${customerId === "demo" ? "DEMO" : customerId.slice(0, 8)}</div><a class="btn primary" href="https://wa.me/">Message business on WhatsApp</a></section>`,
    env
  );
}

function page(title, body, env, schema) {
  const base = env.BASE_URL || brand.baseUrl;
  const fullTitle = `${title} | ${brand.productName}`;
  return `<!doctype html><html lang="en-PK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${fullTitle}</title><meta name="description" content="${brand.description}"><link rel="canonical" href="${base}"><meta property="og:title" content="${fullTitle}"><meta property="og:description" content="${brand.description}"><meta property="og:type" content="website"><meta name="theme-color" content="${brand.colors.teal}"><link rel="manifest" href="/manifest.webmanifest"><style>${styles()}</style>${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ""}</head><body><header><a class="logo" href="/">${brand.productName}</a><nav><a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/industries/salons">Salons</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/login">Login</a><a class="nav-cta" href="/signup">Signup</a></nav></header>${body}<footer><span>${brand.companyName}</span><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund-cancellation">Refunds</a></footer></body></html>`;
}

function styles() {
  return `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:${brand.colors.ink};background:${brand.colors.paper}}*{box-sizing:border-box}body{margin:0}a{color:inherit}header,footer{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(16px,5vw,64px);border-bottom:1px solid #e5e7eb}footer{border-top:1px solid #e5e7eb;border-bottom:0;margin-top:60px}nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.logo{font-weight:800;text-decoration:none}.nav-cta,.btn{border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;text-decoration:none;background:#fff}.primary{background:${brand.colors.teal};color:white;border-color:${brand.colors.teal}}.hero{display:grid;grid-template-columns:1.3fr .7fr;gap:40px;align-items:center;padding:72px clamp(16px,7vw,92px);background:linear-gradient(135deg,#eef8f6,#fff7e8)}h1{font-size:clamp(2rem,5vw,4.8rem);line-height:1.02;margin:0 0 18px}h2{font-size:1.35rem}.lede{font-size:1.18rem;line-height:1.65;color:#475569}.eyebrow{color:${brand.colors.teal};font-weight:800;text-transform:uppercase;letter-spacing:.08em}.actions{display:flex;gap:12px;flex-wrap:wrap}.hero-panel,.pricing article,.stats article,section:not(.hero):not(.band):not(.narrow):not(.legal):not(.workspace):not(.customer-pwa){border:1px solid #e2e8f0;border-radius:8px;padding:20px;background:white}.hero-panel{display:grid;gap:12px;box-shadow:0 24px 70px #0f172a1a}.band,.narrow,.legal{padding:54px clamp(16px,7vw,92px)}.narrow,.legal{max-width:880px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.grid article{padding:18px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}.pricing{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;padding:0 clamp(16px,7vw,92px)}.pricing strong{font-size:2rem;display:block;margin:16px 0}.pricing small{display:block;color:#64748b}.form{display:grid;gap:12px}.form input,.form textarea,.form select{border:1px solid #cbd5e1;border-radius:8px;padding:12px;font:inherit}.app{display:grid;grid-template-columns:230px 1fr;min-height:82vh}.app aside{background:#101827;color:#fff;padding:22px;display:flex;flex-direction:column;gap:14px}.app aside a{color:#dbeafe;text-decoration:none}.workspace{padding:24px;background:#f8fafc}.topbar{display:flex;justify-content:space-between;gap:16px;align-items:center}.topbar h1{font-size:2rem}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stats b{font-size:1.6rem;display:block}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e8f0;padding:10px;text-align:left}.muted{color:#64748b}.chips{display:flex;gap:10px;flex-wrap:wrap}.chips span{border:1px solid #cbd5e1;border-radius:999px;padding:8px 12px}.customer-pwa{min-height:76vh;display:grid;place-items:center;text-align:center;padding:40px}.qr{width:180px;height:180px;border:12px solid #111827;display:grid;place-items:center;font-weight:900;margin:20px auto;background:repeating-linear-gradient(45deg,#fff,#fff 10px,#e2e8f0 10px,#e2e8f0 20px)}@media(max-width:800px){.hero,.app,.two{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}.app aside{position:static}.topbar{align-items:flex-start;flex-direction:column}}`;
}

function card(text) {
  return `<article><strong>${text}</strong></article>`;
}

function manifest(env) {
  return { name: brand.productName, short_name: brand.productName, start_url: "/customer/demo", display: "standalone", background_color: "#ffffff", theme_color: brand.colors.teal };
}

function serviceWorker() {
  return "self.addEventListener('fetch', event => event.respondWith(fetch(event.request).catch(() => caches.match(event.request))))";
}

function sitemap(env) {
  const base = env.BASE_URL || brand.baseUrl;
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "features", "pricing", "industries/salons", "about", "contact", "privacy", "terms", "refund-cancellation", "login", "signup"].map((p) => `<url><loc>${base}/${p}</loc></url>`).join("")}</urlset>`;
}

function robots(env) {
  const base = env.BASE_URL || brand.baseUrl;
  return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
}

function getCookie(request, key) {
  return (request.headers.get("cookie") || "").split(";").map((x) => x.trim().split("=")).find(([k]) => k === key)?.[1];
}

async function resolveOrganizationId(request, db, body) {
  const explicit = request.headers.get("x-organization-id") || body.organizationId;
  if (explicit) return explicit;
  const orgCookie = getCookie(request, "org");
  if (orgCookie) return orgCookie;
  const sessionId = getCookie(request, "session");
  if (sessionId) return new AuthRepository(db).organizationIdForSession(sessionId);
  return null;
}

function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html;charset=utf-8", ...headers } });
}

function text(body) {
  return new Response(body, { headers: { "content-type": "text/plain;charset=utf-8" } });
}

function xml(body) {
  return new Response(body, { headers: { "content-type": "application/xml;charset=utf-8" } });
}

function js(body) {
  return new Response(body, { headers: { "content-type": "application/javascript;charset=utf-8" } });
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json;charset=utf-8", ...headers } });
}
