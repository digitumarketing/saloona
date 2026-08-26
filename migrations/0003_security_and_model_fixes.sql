-- 0003: security hardening, tenancy support, and data-model corrections.
--
-- Covers:
--   * session tokens stored hashed, all existing sessions invalidated
--   * versioned password hashes, email verification and password reset
--   * login throttling and an auth audit trail
--   * per-organization timezone and settings (UTC storage, local day boundaries)
--   * visit line items, so a bill can be "Haircut + Beard"
--   * campaigns and per-recipient attribution for win-back reporting
--   * customer retention fields (visit cadence, expected return, opt-out)
--   * removal of the fake demo tenant that was seeded into production

-------------------------------------------------------------------------------
-- Sessions: replace the old table entirely.
-- The previous design used the session token itself as the primary key, so a
-- database leak allowed session resumption. Tokens are now stored as SHA-256
-- digests. Dropping the table also revokes every session issued under the
-- broken authentication model.
-------------------------------------------------------------------------------
drop table if exists auth_sessions;

create table if not exists sessions (
  id text primary key,
  token_hash text not null unique,
  user_id text not null references users(id),
  organization_id text not null references organizations(id),
  ip_address text,
  user_agent text,
  expires_at text not null,
  last_seen_at text not null,
  revoked_at text,
  created_at text not null
);

create index if not exists idx_sessions_token on sessions(token_hash);
create index if not exists idx_sessions_user on sessions(user_id, revoked_at);

-------------------------------------------------------------------------------
-- Users: hash versioning, verification state, and lockout counters.
-------------------------------------------------------------------------------
alter table users add column password_version text;
alter table users add column email_verified_at text;
alter table users add column last_login_at text;
alter table users add column failed_login_count integer not null default 0;
alter table users add column locked_until text;
alter table users add column phone text;
alter table users add column is_active integer not null default 1;

-- Existing rows were hashed with the legacy single-pass SHA-256 scheme and are
-- upgraded to PBKDF2 on next successful login.
update users set password_version = 'sha256-v0' where password_hash is not null and password_version is null;

-------------------------------------------------------------------------------
-- Single-use tokens for email verification and password reset.
-- Only the digest is stored; the emailed value is never persisted.
-------------------------------------------------------------------------------
create table if not exists auth_tokens (
  id text primary key,
  token_hash text not null unique,
  user_id text not null references users(id),
  organization_id text not null references organizations(id),
  purpose text not null check (purpose in ('email_verification', 'password_reset')),
  expires_at text not null,
  consumed_at text,
  created_at text not null
);

create index if not exists idx_auth_tokens_hash on auth_tokens(token_hash);

-------------------------------------------------------------------------------
-- Login throttling. Counters are keyed by IP and by email so that neither a
-- single address nor a single account can be attacked without limit. Expired
-- rows are removed by the scheduled cleanup job.
-------------------------------------------------------------------------------
create table if not exists rate_limits (
  key text primary key,
  hits integer not null default 0,
  window_started_at text not null,
  blocked_until text
);

create index if not exists idx_rate_limits_window on rate_limits(window_started_at);

-------------------------------------------------------------------------------
-- Auth and security audit trail.
-------------------------------------------------------------------------------
create table if not exists audit_log (
  id text primary key,
  organization_id text,
  user_id text,
  event text not null,
  ip_address text,
  user_agent text,
  detail_json text,
  created_at text not null
);

create index if not exists idx_audit_log_org on audit_log(organization_id, created_at);

-------------------------------------------------------------------------------
-- Organizations: public slug, timezone, trial window, and per-tenant settings.
-- `slug` backs the public customer URL (/j/<slug>) shown on the QR code.
-------------------------------------------------------------------------------
alter table organizations add column slug text;
alter table organizations add column timezone text not null default 'Asia/Karachi';
alter table organizations add column country text not null default 'PK';
alter table organizations add column currency text not null default 'PKR';
alter table organizations add column phone text;
alter table organizations add column logo_url text;
alter table organizations add column trial_ends_at text;
alter table organizations add column settings_json text;
alter table organizations add column suspended_at text;

update organizations set slug = id where slug is null;
create unique index if not exists idx_organizations_slug on organizations(slug);

-------------------------------------------------------------------------------
-- Customers: retention intelligence and consent tracking.
-- `avg_gap_days` is the median interval between this customer's visits and
-- drives per-customer reminder timing rather than one fixed interval for all.
-------------------------------------------------------------------------------
alter table customers add column birthday text;
alter table customers add column preferred_staff_id text references staff(id);
alter table customers add column notes text;
alter table customers add column first_visit_at text;
alter table customers add column total_visits integer not null default 0;
alter table customers add column lifetime_spend_pkr integer not null default 0;
alter table customers add column avg_gap_days real;
alter table customers add column expected_return_at text;
alter table customers add column whatsapp_opt_out_at text;
alter table customers add column source text not null default 'walk_in';
alter table customers add column referred_by_customer_id text references customers(id);
alter table customers add column last_reminder_at text;
alter table customers add column is_archived integer not null default 0;

-- Wallet access for the QR-code PWA. The customer is identified by an opaque
-- token stored on their device; only its digest is kept here, so a database read
-- does not yield working wallet links.
alter table customers add column wallet_token_hash text;
create index if not exists idx_customers_wallet_token on customers(wallet_token_hash);

create index if not exists idx_customers_expected_return on customers(organization_id, expected_return_at);
create index if not exists idx_customers_org_phone on customers(organization_id, phone);

-------------------------------------------------------------------------------
-- Visits become bills with totals and a payment state.
-- `status` lets a bill be voided without deleting it, which matters because
-- retention maths, loyalty points, and revenue reports all read from visits and
-- must agree on which rows count.
-------------------------------------------------------------------------------
alter table visits add column status text not null default 'completed';
alter table visits add column updated_at text;
alter table visits add column subtotal_pkr integer not null default 0;
alter table visits add column discount_pkr integer not null default 0;
alter table visits add column payment_method text;
alter table visits add column payment_status text not null default 'paid';
alter table visits add column points_earned integer not null default 0;
alter table visits add column campaign_id text;

-------------------------------------------------------------------------------
-- Visit line items. The original schema allowed a single service_id per visit,
-- which cannot represent a multi-service bill. Staff attribution lives on the
-- line item so per-staff revenue reporting is accurate when two stylists work
-- on the same customer.
-------------------------------------------------------------------------------
create table if not exists visit_items (
  id text primary key,
  organization_id text not null references organizations(id),
  visit_id text not null references visits(id) on delete cascade,
  service_id text references services(id),
  staff_id text references staff(id),
  service_name text not null,
  quantity integer not null default 1,
  unit_price_pkr integer not null default 0,
  discount_pkr integer not null default 0,
  total_pkr integer not null default 0,
  created_at text not null
);

create index if not exists idx_visit_items_visit on visit_items(visit_id);
create index if not exists idx_visit_items_staff on visit_items(organization_id, staff_id);
create index if not exists idx_visits_customer on visits(customer_id, visited_at);
create index if not exists idx_visits_org_status on visits(organization_id, status, visited_at);

-- Backfill line items from the pre-existing single-service visits so historical
-- reporting stays consistent.
insert into visit_items (id, organization_id, visit_id, service_id, staff_id, service_name, quantity, unit_price_pkr, discount_pkr, total_pkr, created_at)
select
  'vit_' || replace(hex(randomblob(10)), '-', ''),
  v.organization_id,
  v.id,
  v.service_id,
  v.staff_id,
  coalesce(s.name, 'Service'),
  1,
  v.total_pkr,
  0,
  v.total_pkr,
  v.created_at
from visits v
left join services s on s.id = v.service_id
where not exists (select 1 from visit_items vi where vi.visit_id = v.id);

update visits set subtotal_pkr = total_pkr where subtotal_pkr = 0;

-------------------------------------------------------------------------------
-- Campaigns. `visits.recovery_campaign_id` previously referenced a table that
-- was never created, so recovered-revenue reporting could never return a
-- result.
-------------------------------------------------------------------------------
create table if not exists campaigns (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  segment text not null,
  template_key text not null,
  message_body text not null,
  offer_label text,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled')),
  audience_count integer not null default 0,
  sent_count integer not null default 0,
  created_by text references users(id),
  scheduled_for text,
  completed_at text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_campaigns_org on campaigns(organization_id, created_at);

-- One row per targeted customer, so a return visit can be attributed back to
-- the campaign that prompted it within an attribution window.
create table if not exists campaign_recipients (
  id text primary key,
  organization_id text not null references organizations(id),
  campaign_id text not null references campaigns(id) on delete cascade,
  customer_id text not null references customers(id),
  message_id text references message_queue(id),
  status text not null default 'pending',
  converted_visit_id text references visits(id),
  converted_at text,
  revenue_pkr integer not null default 0,
  created_at text not null,
  unique (campaign_id, customer_id)
);

create index if not exists idx_campaign_recipients_campaign on campaign_recipients(campaign_id, status);
create index if not exists idx_campaign_recipients_customer on campaign_recipients(organization_id, customer_id);

-------------------------------------------------------------------------------
-- Message queue: delivery accounting and idempotency.
-- `dedupe_key` prevents the scheduler from queuing the same reminder twice if a
-- cron run overlaps or retries.
-------------------------------------------------------------------------------
alter table message_queue add column attempts integer not null default 0;
alter table message_queue add column last_error text;
alter table message_queue add column dedupe_key text;
alter table message_queue add column campaign_id text references campaigns(id);
alter table message_queue add column to_phone text;
alter table message_queue add column locked_at text;

create unique index if not exists idx_message_queue_dedupe on message_queue(organization_id, dedupe_key)
  where dedupe_key is not null;

-------------------------------------------------------------------------------
-- Rewards: description for display in the customer wallet.
-------------------------------------------------------------------------------
alter table rewards add column description text;

-------------------------------------------------------------------------------
-- Integrations: provider credentials must be encrypted at rest, not stored as
-- plaintext JSON. `config_json` is retained for non-secret settings only.
-------------------------------------------------------------------------------
alter table integrations add column config_encrypted text;
alter table integrations add column config_iv text;
alter table integrations add column connected_at text;
alter table integrations add column last_error text;
alter table integrations add column display_name text;

create unique index if not exists idx_integrations_org_provider on integrations(organization_id, provider);

-------------------------------------------------------------------------------
-- Remove the seeded demo tenant.
-- This fake data was live in production and was being served publicly through
-- the unauthenticated tenancy bypass. Local development re-seeds a richer demo
-- via `npm run seed`, which goes through the real API rather than raw SQL.
-------------------------------------------------------------------------------
delete from visit_items where organization_id = 'org_demo';
delete from reward_redemptions where organization_id = 'org_demo';
delete from rewards where organization_id = 'org_demo';
delete from message_queue where organization_id = 'org_demo';
delete from payments where organization_id = 'org_demo';
delete from visits where organization_id = 'org_demo';
delete from appointments where organization_id = 'org_demo';
delete from services where organization_id = 'org_demo';
delete from customers where organization_id = 'org_demo';
delete from staff where organization_id = 'org_demo';
delete from saas_invoices where organization_id = 'org_demo';
delete from saas_subscriptions where organization_id = 'org_demo';
delete from integrations where organization_id = 'org_demo';
delete from users where organization_id = 'org_demo';
delete from locations where organization_id = 'org_demo';
delete from organizations where id = 'org_demo';
