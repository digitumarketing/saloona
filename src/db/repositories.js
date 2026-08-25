const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;

async function hashPassword(password, salt = crypto.randomUUID()) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { salt, hash };
}

export class D1Repository {
  constructor(db) {
    this.db = db;
  }

  async first(query, params = []) {
    return this.db.prepare(query).bind(...params).first();
  }

  async all(query, params = []) {
    const result = await this.db.prepare(query).bind(...params).all();
    return result.results ?? [];
  }

  async run(query, params = []) {
    return this.db.prepare(query).bind(...params).run();
  }
}

export class OrganizationRepository extends D1Repository {
  async create({ name, ownerEmail, password, planId = "starter", industry = "salon" }) {
    const organizationId = id("org");
    const locationId = id("loc");
    const userId = id("usr");
    const ts = now();
    const passwordRecord = password ? await hashPassword(password) : { salt: null, hash: null };
    await this.run(
      "insert into organizations (id, name, industry, plan_id, status, created_at, updated_at) values (?, ?, ?, ?, 'trialing', ?, ?)",
      [organizationId, name, industry, planId, ts, ts]
    );
    await this.run(
      "insert into locations (id, organization_id, name, city, created_at, updated_at) values (?, ?, 'Main Branch', 'Lahore', ?, ?)",
      [locationId, organizationId, ts, ts]
    );
    await this.run(
      "insert into users (id, organization_id, name, email, password_hash, password_salt, role, created_at, updated_at) values (?, ?, 'Owner', ?, ?, ?, 'owner', ?, ?)",
      [userId, organizationId, ownerEmail, passwordRecord.hash, passwordRecord.salt, ts, ts]
    );
    await this.run(
      "insert into saas_subscriptions (id, organization_id, plan_id, status, amount_pkr, billing_period, started_at, next_invoice_at, created_at) values (?, ?, ?, 'trialing', ?, 'monthly', ?, datetime(?, '+14 days'), ?)",
      [id("sub"), organizationId, planId, planId === "starter" ? 3999 : planId === "growth" ? 7999 : 14999, ts, ts, ts]
    );
    return { organizationId, locationId, userId };
  }

  byId(organizationId) {
    return this.first("select * from organizations where id = ?", [organizationId]);
  }

  byOwnerEmail(email) {
    return this.first(
      "select organizations.* from organizations join users on users.organization_id = organizations.id where users.email = ? and users.role = 'owner'",
      [email]
    );
  }
}

export class AuthRepository extends D1Repository {
  async login(email, password) {
    const user = await this.first("select * from users where email = ? and role in ('owner', 'manager')", [email]);
    if (!user || !user.password_hash || !user.password_salt) return null;
    const attempted = await hashPassword(password, user.password_salt);
    if (attempted.hash !== user.password_hash) return null;
    const sessionId = id("ses");
    const ts = now();
    await this.run(
      "insert into auth_sessions (id, user_id, organization_id, expires_at, created_at) values (?, ?, ?, datetime(?, '+30 days'), ?)",
      [sessionId, user.id, user.organization_id, ts, ts]
    );
    return { sessionId, organizationId: user.organization_id };
  }

  async organizationIdForSession(sessionId) {
    const session = await this.first("select organization_id from auth_sessions where id = ? and expires_at > datetime('now')", [sessionId]);
    return session?.organization_id ?? null;
  }
}

export class CustomerRepository extends D1Repository {
  list(organizationId) {
    return this.all("select * from customers where organization_id = ? order by updated_at desc limit 100", [organizationId]);
  }

  create(organizationId, data) {
    const ts = now();
    return this.run(
      "insert into customers (id, organization_id, full_name, phone, email, consent_whatsapp, loyalty_points, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 0, ?, ?)",
      [id("cus"), organizationId, data.fullName, data.phone, data.email ?? null, data.consentWhatsapp ? 1 : 0, ts, ts]
    );
  }
}

export class ServiceRepository extends D1Repository {
  list(organizationId) {
    return this.all("select * from services where organization_id = ? and is_active = 1 order by name", [organizationId]);
  }

  create(organizationId, data) {
    const ts = now();
    return this.run(
      "insert into services (id, organization_id, name, category, duration_minutes, price_pkr, is_active, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 1, ?, ?)",
      [id("svc"), organizationId, data.name, data.category ?? "General", data.durationMinutes ?? 45, data.pricePkr ?? 0, ts, ts]
    );
  }
}

export class StaffRepository extends D1Repository {
  list(organizationId) {
    return this.all("select * from staff where organization_id = ? order by name", [organizationId]);
  }
}

export class AppointmentRepository extends D1Repository {
  list(organizationId) {
    return this.all(
      "select appointments.*, customers.full_name as customer_name, services.name as service_name from appointments left join customers on customers.id = appointments.customer_id left join services on services.id = appointments.service_id where appointments.organization_id = ? order by scheduled_at desc limit 100",
      [organizationId]
    );
  }
}

export class VisitRepository extends D1Repository {
  async record(organizationId, data) {
    const ts = now();
    const visitId = id("vis");
    await this.run(
      "insert into visits (id, organization_id, location_id, customer_id, service_id, staff_id, total_pkr, visited_at, notes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [visitId, organizationId, data.locationId, data.customerId, data.serviceId, data.staffId ?? null, data.totalPkr ?? 0, data.visitedAt ?? ts, data.notes ?? null, ts]
    );
    await this.run("update customers set last_visit_at = ?, loyalty_points = loyalty_points + ?, updated_at = ? where id = ? and organization_id = ?", [
      data.visitedAt ?? ts,
      Math.floor((data.totalPkr ?? 0) / 100),
      ts,
      data.customerId,
      organizationId
    ]);
    return { visitId };
  }
}

export class AnalyticsRepository extends D1Repository {
  async summary(organizationId) {
    const [counts, revenue, atRisk, recovered] = await Promise.all([
      this.first("select count(*) as customers from customers where organization_id = ?", [organizationId]),
      this.first("select coalesce(sum(total_pkr), 0) as revenue from visits where organization_id = ? and visited_at >= datetime('now', '-30 days')", [organizationId]),
      this.all(
        "select id, full_name, phone, last_visit_at, loyalty_points from customers where organization_id = ? and (last_visit_at is null or last_visit_at < datetime('now', '-45 days')) order by last_visit_at asc limit 20",
        [organizationId]
      ),
      this.all(
        "select customers.id, customers.full_name, max(visits.visited_at) as recovered_at from customers join visits on visits.customer_id = customers.id where customers.organization_id = ? and visits.recovery_campaign_id is not null group by customers.id order by recovered_at desc limit 20",
        [organizationId]
      )
    ]);
    return {
      customers: counts?.customers ?? 0,
      revenue30d: revenue?.revenue ?? 0,
      atRisk,
      recovered
    };
  }
}
