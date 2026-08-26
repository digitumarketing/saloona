/**
 * Prefixed, non-sequential entity IDs.
 *
 * Deliberately not database-generated integers: the blueprint requires the
 * option to shard across D1 databases and to migrate to Postgres later, and
 * both are far easier when IDs carry no ordering or origin information.
 */

const PREFIXES = {
  organization: "org",
  location: "loc",
  user: "usr",
  session: "ses",
  staff: "stf",
  customer: "cus",
  service: "svc",
  appointment: "apt",
  visit: "vis",
  visitItem: "vit",
  reward: "rwd",
  redemption: "rdm",
  message: "msg",
  payment: "pay",
  subscription: "sub",
  invoice: "inv",
  integration: "int",
  campaign: "cmp",
  token: "tok"
} as const;

export type EntityKind = keyof typeof PREFIXES;

export function newId(kind: EntityKind): string {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  return `${PREFIXES[kind]}_${random}`;
}

/** Guards against a caller passing an ID of the wrong entity type. */
export function isIdOf(kind: EntityKind, value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIXES[kind]}_`);
}
