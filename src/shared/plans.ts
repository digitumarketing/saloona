/**
 * Plan definitions — the single source of truth for pricing and limits.
 *
 * Prices previously existed both here and as an inline ternary in the
 * organization repository, which would have drifted the moment one changed.
 * Limits are enforced by `assertWithinPlan`, not merely displayed.
 */

export type PlanId = "starter" | "growth" | "scale";

export interface PlanLimits {
  locations: number;
  staff: number;
  customers: number;
  /** Automated WhatsApp messages included per calendar month. */
  monthlyMessages: number;
  campaignsPerMonth: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  pricePkr: number;
  summary: string;
  /** Marks the plan presented as the default recommendation. */
  highlighted: boolean;
  limits: PlanLimits;
  features: string[];
  /** Capabilities gated by plan, checked via `planAllows`. */
  capabilities: string[];
}

export const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: "Starter",
    pricePkr: 3999,
    summary: "For a single branch getting serious about repeat customers.",
    highlighted: false,
    limits: { locations: 1, staff: 5, customers: 2000, monthlyMessages: 500, campaignsPerMonth: 2 },
    features: [
      "Customer records with full visit history",
      "Reception checkout with multi-service bills",
      "Loyalty points and rewards",
      "QR customer wallet (PWA)",
      "Cash, Raast, JazzCash and Easypaisa recording",
      "Return reminders on your own WhatsApp",
      "500 automated messages/month"
    ],
    capabilities: ["loyalty", "whatsapp", "reminders", "customer_pwa"]
  },
  {
    id: "growth",
    name: "Growth",
    pricePkr: 7999,
    summary: "For busy salons that want customers brought back automatically.",
    highlighted: true,
    limits: { locations: 3, staff: 20, customers: 10_000, monthlyMessages: 2500, campaignsPerMonth: 10 },
    features: [
      "Everything in Starter",
      "Win-back campaigns with revenue attribution",
      "Per-customer visit cadence intelligence",
      "Staff performance and retention reports",
      "Review requests after service",
      "Customer segments and CSV export",
      "2,500 automated messages/month"
    ],
    capabilities: [
      "loyalty",
      "whatsapp",
      "reminders",
      "customer_pwa",
      "campaigns",
      "staff_reports",
      "segments",
      "review_requests",
      "exports"
    ]
  },
  {
    id: "scale",
    name: "Scale",
    pricePkr: 14_999,
    summary: "For multi-branch operators that need controls and integrations.",
    highlighted: false,
    limits: { locations: 10, staff: 75, customers: 50_000, monthlyMessages: 10_000, campaignsPerMonth: 50 },
    features: [
      "Everything in Growth",
      "Multiple branches with per-branch reporting",
      "Online payment gateway connection",
      "Role-based staff permissions",
      "Advanced analytics and cohort retention",
      "Priority onboarding and support",
      "10,000 automated messages/month"
    ],
    capabilities: [
      "loyalty",
      "whatsapp",
      "reminders",
      "customer_pwa",
      "campaigns",
      "staff_reports",
      "segments",
      "review_requests",
      "exports",
      "multi_branch",
      "payment_gateway",
      "permissions",
      "advanced_analytics"
    ]
  }
];

const PLAN_BY_ID = new Map<PlanId, Plan>(PLANS.map((plan) => [plan.id, plan]));

export function getPlan(planId: string): Plan {
  return PLAN_BY_ID.get(planId as PlanId) ?? PLANS[0]!;
}

export function planPrice(planId: string): number {
  return getPlan(planId).pricePkr;
}

export function planLimits(planId: string): PlanLimits {
  return getPlan(planId).limits;
}

/** Feature gate check used by both the API and the UI. */
export function planAllows(planId: string, capability: string): boolean {
  return getPlan(planId).capabilities.includes(capability);
}

export function formatPkr(amount: number): string {
  // Explicit grouping rather than Intl: the Workers runtime ships limited ICU
  // data, and en-PK currency formatting is not reliably available.
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}Rs. ${grouped}`;
}
