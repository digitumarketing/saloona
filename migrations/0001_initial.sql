create table if not exists organizations (
  id text primary key,
  name text not null,
  industry text not null default 'salon',
  plan_id text not null default 'starter',
  status text not null default 'trialing',
  created_at text not null,
  updated_at text not null
);

create table if not exists locations (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  city text,
  address text,
  phone text,
  created_at text not null,
  updated_at text not null
);

create table if not exists users (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  email text not null unique,
  password_hash text,
  password_salt text,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at text not null,
  updated_at text not null
);

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null references users(id),
  organization_id text not null references organizations(id),
  expires_at text not null,
  created_at text not null
);

create table if not exists staff (
  id text primary key,
  organization_id text not null references organizations(id),
  location_id text references locations(id),
  name text not null,
  phone text,
  role text,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create table if not exists customers (
  id text primary key,
  organization_id text not null references organizations(id),
  full_name text not null,
  phone text not null,
  email text,
  consent_whatsapp integer not null default 0,
  loyalty_points integer not null default 0,
  last_visit_at text,
  created_at text not null,
  updated_at text not null,
  unique (organization_id, phone)
);

create table if not exists services (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  category text,
  duration_minutes integer not null default 45,
  price_pkr integer not null default 0,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create table if not exists appointments (
  id text primary key,
  organization_id text not null references organizations(id),
  location_id text references locations(id),
  customer_id text references customers(id),
  service_id text references services(id),
  staff_id text references staff(id),
  status text not null default 'booked',
  scheduled_at text not null,
  notes text,
  created_at text not null,
  updated_at text not null
);

create table if not exists visits (
  id text primary key,
  organization_id text not null references organizations(id),
  location_id text references locations(id),
  customer_id text not null references customers(id),
  service_id text references services(id),
  staff_id text references staff(id),
  total_pkr integer not null default 0,
  visited_at text not null,
  recovery_campaign_id text,
  notes text,
  created_at text not null
);

create table if not exists rewards (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  points_required integer not null,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create table if not exists reward_redemptions (
  id text primary key,
  organization_id text not null references organizations(id),
  customer_id text not null references customers(id),
  reward_id text not null references rewards(id),
  points_spent integer not null,
  redeemed_at text not null
);

create table if not exists message_queue (
  id text primary key,
  organization_id text not null references organizations(id),
  customer_id text references customers(id),
  channel text not null default 'whatsapp',
  provider text not null default 'business_owned',
  template_key text not null,
  body text not null,
  status text not null default 'queued',
  scheduled_for text not null,
  sent_at text,
  provider_message_id text,
  created_at text not null,
  updated_at text not null
);

create table if not exists payments (
  id text primary key,
  organization_id text not null references organizations(id),
  customer_id text references customers(id),
  visit_id text references visits(id),
  provider text not null,
  type text not null check (type in ('business_customer', 'digitum_subscription')),
  amount_pkr integer not null,
  status text not null,
  reference text,
  created_at text not null,
  updated_at text not null
);

create table if not exists saas_subscriptions (
  id text primary key,
  organization_id text not null references organizations(id),
  plan_id text not null,
  status text not null,
  amount_pkr integer not null,
  billing_period text not null default 'monthly',
  started_at text not null,
  next_invoice_at text,
  created_at text not null
);

create table if not exists saas_invoices (
  id text primary key,
  organization_id text not null references organizations(id),
  plan_id text not null,
  amount_pkr integer not null,
  status text not null,
  due_at text not null,
  paid_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists integrations (
  id text primary key,
  organization_id text not null references organizations(id),
  provider text not null,
  category text not null,
  status text not null default 'inactive',
  config_json text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_customers_org_last_visit on customers(organization_id, last_visit_at);
create index if not exists idx_visits_org_visited on visits(organization_id, visited_at);
create index if not exists idx_appointments_org_scheduled on appointments(organization_id, scheduled_at);
create index if not exists idx_message_queue_status on message_queue(status, scheduled_for);
