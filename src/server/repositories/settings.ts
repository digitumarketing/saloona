/**
 * Per-organization settings.
 *
 * Stored as JSON on the organization row rather than as columns: these are read
 * once per request, changed rarely, and adding a setting should not require a
 * migration. Defaults are applied on read so an older row missing a key behaves
 * correctly instead of producing `undefined` deep inside the loyalty maths.
 */

import type { TenantDb } from "../lib/db.js";
import { nowIso } from "../lib/time.js";

export interface OrgSettings {
  /** Loyalty points awarded per PKR 100 spent. */
  pointsPerHundredPkr: number;
  /** Whether automated return reminders are sent at all. */
  reminderEnabled: boolean;
  /** Fallback return window for customers without enough history for a median. */
  defaultReturnDays: number;
  /** How far past the expected return date before a customer is "at risk". */
  atRiskMultiplier: number;
  /** Whether review requests are sent after a visit. */
  reviewRequestEnabled: boolean;
  reviewUrl: string | null;
  /** Free-text used in reminder messages, e.g. "Salon Zara, Gulberg". */
  messageSignature: string | null;
  onboardingCompletedAt: string | null;
}

export const DEFAULT_SETTINGS: OrgSettings = {
  pointsPerHundredPkr: 1,
  reminderEnabled: true,
  defaultReturnDays: 30,
  atRiskMultiplier: 1.5,
  reviewRequestEnabled: false,
  reviewUrl: null,
  messageSignature: null,
  onboardingCompletedAt: null
};

export class SettingsRepository {
  constructor(private readonly db: TenantDb) {}

  async get(): Promise<OrgSettings> {
    const row = await this.db.organizationRow<{ settings_json: string | null }>("settings_json");
    return parseSettings(row?.settings_json ?? null);
  }

  async update(patch: Partial<OrgSettings>): Promise<OrgSettings> {
    const current = await this.get();
    const next: OrgSettings = { ...current, ...patch };
    await this.db.updateOrganization("settings_json = ?, updated_at = ?", [JSON.stringify(next), nowIso()]);
    return next;
  }
}

export function parseSettings(json: string | null): OrgSettings {
  if (!json) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(json) as Partial<OrgSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    // A corrupt settings blob must not take the dashboard down.
    console.error("Invalid settings_json; falling back to defaults");
    return { ...DEFAULT_SETTINGS };
  }
}
