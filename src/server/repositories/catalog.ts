/**
 * Catalog repositories: services, staff, locations, and rewards.
 *
 * These are the reference data a salon configures once and then uses at every
 * checkout, so each list is small, cacheable, and read far more than written.
 */

import { NotFoundError, type TenantDb } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";

export interface ServiceRow {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price_pkr: number;
  is_active: number;
}

export interface StaffRow {
  id: string;
  location_id: string | null;
  name: string;
  phone: string | null;
  role: string | null;
  is_active: number;
}

export interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
}

export interface RewardRow {
  id: string;
  name: string;
  description: string | null;
  points_required: number;
  is_active: number;
}

export class ServiceRepository {
  constructor(private readonly db: TenantDb) {}

  list(includeInactive = false): Promise<ServiceRow[]> {
    return this.db.all<ServiceRow>(
      `select id, name, category, duration_minutes, price_pkr, is_active from services
       ${includeInactive ? "where 1 = 1" : "where is_active = 1"} {where}
       order by category collate nocase, name collate nocase`
    );
  }

  async create(input: { name: string; category?: string; durationMinutes: number; pricePkr: number }): Promise<ServiceRow> {
    const id = newId("service");
    const ts = nowIso();
    await this.db.insert("services", {
      id,
      name: input.name,
      category: input.category ?? null,
      duration_minutes: input.durationMinutes,
      price_pkr: input.pricePkr,
      is_active: 1,
      created_at: ts,
      updated_at: ts
    });
    return this.get(id);
  }

  async get(id: string): Promise<ServiceRow> {
    const row = await this.db.first<ServiceRow>(
      "select id, name, category, duration_minutes, price_pkr, is_active from services where id = ? {where}",
      [id]
    );
    if (!row) throw new NotFoundError("Service");
    return row;
  }

  async update(
    id: string,
    input: Partial<{ name: string; category: string; durationMinutes: number; pricePkr: number; isActive: boolean }>
  ): Promise<ServiceRow> {
    const updates = buildUpdate({
      name: input.name,
      category: input.category,
      duration_minutes: input.durationMinutes,
      price_pkr: input.pricePkr,
      is_active: input.isActive === undefined ? undefined : input.isActive ? 1 : 0
    });
    if (!updates) return this.get(id);
    const result = await this.db.run(`update services set ${updates.sql}, updated_at = ? where id = ? {where}`, [
      ...updates.params,
      nowIso(),
      id
    ]);
    if (result.meta.changes === 0) throw new NotFoundError("Service");
    return this.get(id);
  }

  /**
   * Services are deactivated rather than deleted: historical visit line items
   * reference them, and a removed row would break past receipts and reports.
   */
  async deactivate(id: string): Promise<void> {
    const result = await this.db.run("update services set is_active = 0, updated_at = ? where id = ? {where}", [
      nowIso(),
      id
    ]);
    if (result.meta.changes === 0) throw new NotFoundError("Service");
  }
}

export class StaffRepository {
  constructor(private readonly db: TenantDb) {}

  list(includeInactive = false): Promise<StaffRow[]> {
    return this.db.all<StaffRow>(
      `select id, location_id, name, phone, role, is_active from staff
       ${includeInactive ? "where 1 = 1" : "where is_active = 1"} {where}
       order by name collate nocase`
    );
  }

  async create(input: { name: string; phone?: string; role?: string; locationId?: string }): Promise<StaffRow> {
    const id = newId("staff");
    const ts = nowIso();
    await this.db.insert("staff", {
      id,
      name: input.name,
      phone: input.phone ?? null,
      role: input.role ?? null,
      location_id: input.locationId ?? null,
      is_active: 1,
      created_at: ts,
      updated_at: ts
    });
    return this.get(id);
  }

  async get(id: string): Promise<StaffRow> {
    const row = await this.db.first<StaffRow>(
      "select id, location_id, name, phone, role, is_active from staff where id = ? {where}",
      [id]
    );
    if (!row) throw new NotFoundError("Staff member");
    return row;
  }

  async update(
    id: string,
    input: Partial<{ name: string; phone: string; role: string; locationId: string; isActive: boolean }>
  ): Promise<StaffRow> {
    const updates = buildUpdate({
      name: input.name,
      phone: input.phone,
      role: input.role,
      location_id: input.locationId,
      is_active: input.isActive === undefined ? undefined : input.isActive ? 1 : 0
    });
    if (!updates) return this.get(id);
    const result = await this.db.run(`update staff set ${updates.sql}, updated_at = ? where id = ? {where}`, [
      ...updates.params,
      nowIso(),
      id
    ]);
    if (result.meta.changes === 0) throw new NotFoundError("Staff member");
    return this.get(id);
  }

  async deactivate(id: string): Promise<void> {
    const result = await this.db.run("update staff set is_active = 0, updated_at = ? where id = ? {where}", [nowIso(), id]);
    if (result.meta.changes === 0) throw new NotFoundError("Staff member");
  }
}

export class LocationRepository {
  constructor(private readonly db: TenantDb) {}

  list(): Promise<LocationRow[]> {
    return this.db.all<LocationRow>(
      "select id, name, city, address, phone from locations where 1 = 1 {where} order by created_at asc"
    );
  }

  async primary(): Promise<LocationRow | null> {
    return this.db.first<LocationRow>(
      "select id, name, city, address, phone from locations where 1 = 1 {where} order by created_at asc limit 1"
    );
  }

  async create(input: { name: string; city?: string; address?: string; phone?: string }): Promise<LocationRow> {
    const id = newId("location");
    const ts = nowIso();
    await this.db.insert("locations", {
      id,
      name: input.name,
      city: input.city ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      created_at: ts,
      updated_at: ts
    });
    const row = await this.db.first<LocationRow>(
      "select id, name, city, address, phone from locations where id = ? {where}",
      [id]
    );
    if (!row) throw new NotFoundError("Location");
    return row;
  }
}

export class RewardRepository {
  constructor(private readonly db: TenantDb) {}

  list(includeInactive = false): Promise<RewardRow[]> {
    return this.db.all<RewardRow>(
      `select id, name, description, points_required, is_active from rewards
       ${includeInactive ? "where 1 = 1" : "where is_active = 1"} {where}
       order by points_required asc`
    );
  }

  async create(input: { name: string; pointsRequired: number; description?: string }): Promise<RewardRow> {
    const id = newId("reward");
    const ts = nowIso();
    await this.db.insert("rewards", {
      id,
      name: input.name,
      description: input.description ?? null,
      points_required: input.pointsRequired,
      is_active: 1,
      created_at: ts,
      updated_at: ts
    });
    const row = await this.db.first<RewardRow>(
      "select id, name, description, points_required, is_active from rewards where id = ? {where}",
      [id]
    );
    if (!row) throw new NotFoundError("Reward");
    return row;
  }

  async deactivate(id: string): Promise<void> {
    const result = await this.db.run("update rewards set is_active = 0, updated_at = ? where id = ? {where}", [
      nowIso(),
      id
    ]);
    if (result.meta.changes === 0) throw new NotFoundError("Reward");
  }
}

/** Builds a partial UPDATE clause, skipping undefined fields. */
function buildUpdate(columns: Record<string, unknown>): { sql: string; params: unknown[] } | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(value);
  }
  return sets.length ? { sql: sets.join(", "), params } : null;
}
