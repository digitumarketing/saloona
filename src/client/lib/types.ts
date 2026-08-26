/**
 * API response types.
 *
 * These mirror the row shapes the repositories return, snake_case included.
 * Renaming at the boundary was considered and rejected: two names for the same
 * field is how a dashboard ends up displaying `undefined` after a schema change
 * that TypeScript should have caught.
 */

export type Role = "owner" | "manager" | "staff";
export type RetentionStatus = "new" | "active" | "due" | "at_risk" | "lost";
export type PlanId = "starter" | "growth" | "scale";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
  planId: PlanId;
  trialEndsAt: string | null;
  suspendedAt: string | null;
}

export interface PlanLimits {
  locations: number;
  staff: number;
  customers: number;
  monthlyMessages: number;
  campaignsPerMonth: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  pricePkr: number;
  summary: string;
  highlighted: boolean;
  limits: PlanLimits;
  features: string[];
  capabilities: string[];
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  consent_whatsapp: number;
  loyalty_points: number;
  total_visits: number;
  lifetime_spend_pkr: number;
  avg_gap_days: number | null;
  expected_return_at: string | null;
  first_visit_at: string | null;
  last_visit_at: string | null;
  birthday: string | null;
  preferred_staff_id: string | null;
  whatsapp_opt_out_at: string | null;
  notes: string | null;
  is_archived: number;
  created_at: string;
  retention_status: RetentionStatus;
  days_since_visit: number | null;
}

export interface AtRiskCustomer extends Customer {
  days_overdue: number;
  recoverable_pkr: number;
}

export interface Service {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price_pkr: number;
  is_active: number;
}

export interface Staff {
  id: string;
  location_id: string | null;
  name: string;
  phone: string | null;
  role: string | null;
  is_active: number;
}

export interface Location {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  points_required: number;
  is_active: number;
}

export interface VisitItem {
  id: string;
  service_id: string | null;
  service_name: string;
  staff_id: string | null;
  staff_name: string | null;
  quantity: number;
  unit_price_pkr: number;
  discount_pkr: number;
  total_pkr: number;
}

export interface Visit {
  id: string;
  customer_id: string;
  location_id: string | null;
  status: string;
  subtotal_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  points_earned: number;
  payment_method: string | null;
  payment_status: string;
  campaign_id: string | null;
  visited_at: string;
  notes: string | null;
  customer_name: string;
  customer_phone: string;
  item_summary?: string | null;
}

export interface VisitWithItems extends Visit {
  items: VisitItem[];
}

export interface Redemption {
  id: string;
  customer_id: string;
  reward_id: string;
  reward_name: string;
  points_spent: number;
  redeemed_at: string;
}

export interface Wallet {
  points: number;
  nextReward: { id: string; name: string; pointsRequired: number; pointsRemaining: number } | null;
  unlocked: Array<{ id: string; name: string; pointsRequired: number }>;
}

// ---------------------------------------------------------------------------
// Customer-facing surface (the QR-code PWA)
// ---------------------------------------------------------------------------

/** The only facts about a salon a customer is shown. No staff, no revenue. */
export interface PublicSalon {
  name: string;
  slug: string;
  city: string | null;
  logoUrl: string | null;
}

export interface JoinPayload {
  salon: PublicSalon;
  rewards: Array<{ name: string; description: string | null; points_required: number }>;
  pointsPerHundredPkr: number;
}

export interface WalletVisit {
  id: string;
  visitedAt: string;
  /** A comma-joined service list, absent on a visit recorded without items. */
  services?: string | null;
  totalPkr: number;
  pointsEarned: number;
}

export interface WalletPayload {
  salon: PublicSalon;
  /** The phone number arrives masked; the wallet never displays it in full. */
  customer: { name: string; phone: string; whatsappOptedOut: boolean };
  wallet: Wallet;
  visits: WalletVisit[];
  redemptions: Redemption[];
}

export interface DashboardSummary {
  today: { visits: number; revenuePkr: number; newCustomers: number };
  month: { visits: number; revenuePkr: number; newCustomers: number; recoveredPkr: number; recoveredVisits: number };
  customers: { total: number; active: number; atRisk: number; lost: number };
  loyalty: { pointsOutstanding: number; redemptionsThisMonth: number };
  messaging: { sentThisMonth: number; queued: number; failed: number };
  retention: { repeatRatePercent: number; averageTicketPkr: number; averageVisitGapDays: number | null };
}

export interface RevenuePoint {
  day: string;
  revenue_pkr: number;
  visits: number;
}

export interface OrgSettings {
  pointsPerHundredPkr: number;
  reminderEnabled: boolean;
  defaultReturnDays: number;
  atRiskMultiplier: number;
  reviewRequestEnabled: boolean;
  reviewUrl: string | null;
  messageSignature: string | null;
  onboardingCompletedAt: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  segment: string;
  template_key: string;
  message_body: string;
  offer_label: string | null;
  status: string;
  audience_count: number;
  sent_count: number;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CampaignReport extends Campaign {
  delivered: number;
  failed: number;
  conversions: number;
  revenue_pkr: number;
  conversion_rate_percent: number;
}

export interface MessageTemplate {
  key: string;
  metaName: string;
  label: string;
  description: string;
  params: string[];
  body: string;
  category: "UTILITY" | "MARKETING";
}

export interface QueuedMessage {
  id: string;
  customer_name: string | null;
  template_key: string;
  body: string;
  status: string;
  attempts: number;
  last_error: string | null;
  scheduled_for: string;
  sent_at: string | null;
}

export interface Bootstrap {
  user: User;
  organization: Organization;
  plan: Plan;
  limits: PlanLimits;
  trial: { endsAt: string | null; daysLeft: number | null };
  summary: DashboardSummary;
  revenueSeries: RevenuePoint[];
  atRisk: AtRiskCustomer[];
  services: Service[];
  staff: Staff[];
  settings: OrgSettings;
  messageStats: { queued: number; sent: number; failed: number };
  campaignTotals: { campaigns: number; messaged: number; recovered: number; revenue_pkr: number };
  /** Whether queued messages have a number to leave from. */
  whatsapp: { status: string; displayPhone: string | null };
  joinUrl: string;
  setup: {
    hasServices: boolean;
    hasStaff: boolean;
    hasCustomers: boolean;
    hasVisits: boolean;
    onboardingCompletedAt: string | null;
  };
}

export interface SettingsPayload {
  organization: Organization;
  plan: Plan;
  settings: OrgSettings;
  /** Columns on the organization row that the session context does not carry. */
  profile: { phone: string | null; logoUrl: string | null };
  locations: Location[];
  whatsapp: {
    status: string;
    displayPhone: string | null;
    connectedAt: string | null;
    lastError: string | null;
  };
  usage: { messagesThisMonth: number; messageAllowance: number };
  joinUrl: string;
}

export interface AudiencePreview {
  segment: string;
  count: number;
  customers: Array<{ id: string; full_name: string; phone: string; loyalty_points: number }>;
  allowance: { used: number; total: number; remaining: number };
  withinAllowance: boolean;
}

export interface StaffPerformanceRow {
  staff_id: string;
  staff_name: string;
  services: number;
  revenue_pkr: number;
  customers: number;
}

export interface ServicePerformanceRow {
  service_name: string;
  bookings: number;
  revenue_pkr: number;
}
