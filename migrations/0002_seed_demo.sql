insert or ignore into organizations (id, name, industry, plan_id, status, created_at, updated_at)
values ('org_demo', 'Demo Salon Lahore', 'salon', 'growth', 'trialing', datetime('now'), datetime('now'));

insert or ignore into locations (id, organization_id, name, city, address, phone, created_at, updated_at)
values ('loc_demo', 'org_demo', 'Gulberg Branch', 'Lahore', 'Main Boulevard, Gulberg', '+92 300 0000000', datetime('now'), datetime('now'));

insert or ignore into users (id, organization_id, name, email, role, created_at, updated_at)
values ('usr_demo_owner', 'org_demo', 'Demo Owner', 'owner@example.com', 'owner', datetime('now'), datetime('now'));

insert or ignore into staff (id, organization_id, location_id, name, phone, role, is_active, created_at, updated_at)
values
  ('stf_ayesha', 'org_demo', 'loc_demo', 'Ayesha', '+92 301 1111111', 'Stylist', 1, datetime('now'), datetime('now')),
  ('stf_bilal', 'org_demo', 'loc_demo', 'Bilal', '+92 302 2222222', 'Barber', 1, datetime('now'), datetime('now'));

insert or ignore into customers (id, organization_id, full_name, phone, email, consent_whatsapp, loyalty_points, last_visit_at, created_at, updated_at)
values
  ('cus_sara', 'org_demo', 'Sara Khan', '+92 333 1234567', null, 1, 340, datetime('now', '-12 days'), datetime('now', '-6 months'), datetime('now')),
  ('cus_ali', 'org_demo', 'Ali Raza', '+92 333 7654321', null, 1, 80, datetime('now', '-74 days'), datetime('now', '-7 months'), datetime('now')),
  ('cus_hina', 'org_demo', 'Hina Ahmed', '+92 334 1112223', null, 1, 190, datetime('now', '-58 days'), datetime('now', '-8 months'), datetime('now'));

insert or ignore into services (id, organization_id, name, category, duration_minutes, price_pkr, is_active, created_at, updated_at)
values
  ('svc_haircut', 'org_demo', 'Haircut', 'Hair', 35, 1500, 1, datetime('now'), datetime('now')),
  ('svc_facial', 'org_demo', 'Glow Facial', 'Skin', 60, 4500, 1, datetime('now'), datetime('now')),
  ('svc_color', 'org_demo', 'Hair Color', 'Hair', 120, 9000, 1, datetime('now'), datetime('now'));

insert or ignore into appointments (id, organization_id, location_id, customer_id, service_id, staff_id, status, scheduled_at, notes, created_at, updated_at)
values
  ('apt_1', 'org_demo', 'loc_demo', 'cus_sara', 'svc_facial', 'stf_ayesha', 'booked', datetime('now', '+1 day'), null, datetime('now'), datetime('now')),
  ('apt_2', 'org_demo', 'loc_demo', 'cus_ali', 'svc_haircut', 'stf_bilal', 'booked', datetime('now', '+2 days'), 'Recovered from WhatsApp reminder', datetime('now'), datetime('now'));

insert or ignore into visits (id, organization_id, location_id, customer_id, service_id, staff_id, total_pkr, visited_at, recovery_campaign_id, notes, created_at)
values
  ('vis_1', 'org_demo', 'loc_demo', 'cus_sara', 'svc_color', 'stf_ayesha', 9000, datetime('now', '-12 days'), null, null, datetime('now')),
  ('vis_2', 'org_demo', 'loc_demo', 'cus_ali', 'svc_haircut', 'stf_bilal', 1500, datetime('now', '-5 days'), 'cmp_winback_1', null, datetime('now'));

insert or ignore into rewards (id, organization_id, name, points_required, is_active, created_at, updated_at)
values
  ('rwd_discount', 'org_demo', 'PKR 500 discount', 250, 1, datetime('now'), datetime('now')),
  ('rwd_blowdry', 'org_demo', 'Free blow dry', 500, 1, datetime('now'), datetime('now'));

insert or ignore into saas_subscriptions (id, organization_id, plan_id, status, amount_pkr, billing_period, started_at, next_invoice_at, created_at)
values ('sub_demo', 'org_demo', 'growth', 'trialing', 7999, 'monthly', datetime('now'), datetime('now', '+14 days'), datetime('now'));
