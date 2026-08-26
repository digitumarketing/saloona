/**
 * Checkout — recording a visit.
 *
 * This is the screen that gets used forty times a day with a customer standing on
 * the other side of the counter, so it is built around taps rather than typing:
 * find the person, tap the services, tap the payment method, done. Everything
 * else on it is optional.
 *
 * The bill is a list of line items because "Haircut + Beard trim, beard by Bilal"
 * is the normal case, not the exception, and per-line staff attribution is what
 * makes the staff report worth reading later.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useDebounced, useMutation } from "../../lib/hooks";
import { Link, navigate, useQueryParam } from "../../lib/router";
import type { Customer, Service, VisitWithItems } from "../../lib/types";
import {
  PAYMENT_METHODS,
  formatDateTime,
  formatNumber,
  formatPhone,
  formatPkr,
  initials,
  pluralize
} from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  NumberInput,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  TextInput
} from "../../components/ui";
import { useApp } from "../context";
import { AddCustomerModal } from "./Customers";

interface LineItem {
  /** Stable key so React does not re-key rows when one is removed mid-bill. */
  key: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  quantity: number;
  unitPricePkr: number;
  discountPkr: number;
}

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function CheckoutPage() {
  const { data, refresh } = useApp();
  const [customerParam] = useQueryParam("customer");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<{ visit: VisitWithItems; pointsEarned: number } | null>(null);

  // Arriving from a customer's page or the at-risk list should land on a bill
  // that is already addressed to them.
  const prefill = useAsync(
    (signal) =>
      customerParam
        ? api.get<{ customer: Customer }>(`/api/customers/${customerParam}`, undefined, signal)
        : Promise.resolve(null),
    [customerParam]
  );

  useEffect(() => {
    if (prefill.data?.customer) setCustomer(prefill.data.customer);
  }, [prefill.data]);

  const services = useMemo(() => data.services.filter((service) => service.is_active === 1), [data.services]);
  const staff = useMemo(() => data.staff.filter((member) => member.is_active === 1), [data.staff]);

  const subtotal = items.reduce((sum, item) => sum + item.unitPricePkr * item.quantity, 0);
  const discount = items.reduce((sum, item) => sum + Math.min(item.discountPkr, item.unitPricePkr * item.quantity), 0);
  const total = subtotal - discount;
  // Mirrors the server's integer maths exactly so the figure on screen is the
  // figure the customer is told.
  const pointsPreview = Math.floor((total / 100) * data.settings.pointsPerHundredPkr);

  const record = useMutation(async () =>
    api.post<{ visit: VisitWithItems; pointsEarned: number }>("/api/visits", {
      customerId: customer!.id,
      items: items.map((item) => ({
        serviceId: item.serviceId,
        staffId: item.staffId || undefined,
        quantity: item.quantity,
        unitPricePkr: item.unitPricePkr,
        discountPkr: item.discountPkr
      })),
      paymentMethod,
      paymentReference: paymentReference || undefined,
      notes: notes || undefined
    })
  );

  const addService = (service: Service) => {
    setItems((current) => [
      ...current,
      {
        key: `${service.id}-${current.length}-${service.name.length}`,
        serviceId: service.id,
        serviceName: service.name,
        // Pre-selecting the only staff member saves a tap in the single-chair
        // salons that make up most of the first customers.
        staffId: staff.length === 1 ? staff[0]!.id : "",
        quantity: 1,
        unitPricePkr: service.price_pkr,
        discountPkr: 0
      }
    ]);
  };

  const submit = async () => {
    if (!customer || items.length === 0) return;
    const result = await record.run();
    if (!result) return;
    setReceipt(result);
    // The bootstrap payload carries today's totals and the at-risk list, both of
    // which this visit just changed.
    refresh();
  };

  const startNew = () => {
    setReceipt(null);
    setCustomer(null);
    setItems([]);
    setPaymentMethod("cash");
    setPaymentReference("");
    setNotes("");
    record.reset();
    navigate("/app/checkout");
  };

  if (receipt) {
    return (
      <Receipt
        visit={receipt.visit}
        pointsEarned={receipt.pointsEarned}
        salonName={data.organization.name}
        onNew={startNew}
      />
    );
  }

  if (services.length === 0) {
    return (
      <div>
        <PageHeader title="Checkout" />
        <Card>
          <EmptyState
            title="Add your services first"
            body="A bill is made of services and prices. Add the five or six you do most often and checkout takes ten seconds."
            action={
              <Button onClick={() => navigate("/app/setup")} variant="primary">
                Add services
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader
        title="New visit"
        subtitle="Find the customer, tap what they had, take payment."
        actions={
          items.length > 0 || customer ? (
            <Button onClick={startNew} variant="ghost">
              Clear
            </Button>
          ) : undefined
        }
      />

      {record.error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
          {record.error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title="1. Customer" />
            <CardBody>
              {customer ? (
                <SelectedCustomer customer={customer} onClear={() => setCustomer(null)} />
              ) : prefill.loading ? (
                <p className="flex items-center gap-2 text-sm text-ink-500">
                  <Spinner size={14} /> Loading customer…
                </p>
              ) : (
                <CustomerPicker onPick={setCustomer} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="2. What did they have?"
              subtitle="Tap a service to add it to the bill."
            />
            <CardBody className="space-y-5">
              <ServiceGrid services={services} onAdd={addService} />

              {items.length === 0 ? (
                <p className="rounded-lg bg-ink-50 px-3.5 py-3 text-sm text-ink-500">
                  No services on the bill yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {items.map((item, index) => (
                    <LineItemRow
                      key={item.key}
                      item={item}
                      staff={staff}
                      error={record.fields[`items.${index}.unitPricePkr`]}
                      onChange={(next) =>
                        setItems((current) => current.map((entry) => (entry.key === item.key ? next : entry)))
                      }
                      onRemove={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                    />
                  ))}
                </ul>
              )}
              {record.fields.items ? <p className="error-text">{record.fields.items}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Payment" />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    aria-pressed={paymentMethod === method.value}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                      paymentMethod === method.value
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50"
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>

              {paymentMethod !== "cash" && paymentMethod !== "unpaid" ? (
                <TextInput
                  label="Transaction reference"
                  hint="Optional — the JazzCash or Easypaisa TID, for your own reconciliation."
                  value={paymentReference}
                  onChange={setPaymentReference}
                  error={record.fields.paymentReference}
                />
              ) : null}

              {paymentMethod === "unpaid" ? (
                <p className="rounded-lg bg-gold-100 px-3.5 py-2.5 text-sm text-gold-700">
                  Recorded as unpaid. The visit and points still count; the bill is marked outstanding.
                </p>
              ) : null}

              <TextInput
                label="Notes"
                hint="Optional — anything worth remembering next time."
                value={notes}
                onChange={setNotes}
                error={record.fields.notes}
              />

              <p className="text-xs leading-5 text-ink-500">
                Customers pay you directly. Saloona never handles your customers' money and takes no cut of this bill.
              </p>
            </CardBody>
          </Card>
        </div>

        <BillSummary
          customer={customer}
          items={items}
          subtotal={subtotal}
          discount={discount}
          total={total}
          pointsPreview={pointsPreview}
          paymentMethod={paymentMethod}
          busy={record.busy}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer selection
// ---------------------------------------------------------------------------

function CustomerPicker({ onPick }: { onPick: (customer: Customer) => void }) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const debounced = useDebounced(search);

  const results = useAsync(
    (signal) =>
      debounced.trim().length >= 2
        ? api.get<{ customers: Customer[] }>("/api/customers", { search: debounced, limit: 8 }, signal)
        : Promise.resolve(null),
    [debounced]
  );

  const customers = results.data?.customers ?? [];
  // A search that is all digits is almost certainly a phone number, so offering
  // it as the new customer's number saves retyping it.
  const looksLikePhone = /^[\d\s+-]{7,}$/.test(search.trim());

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Name or mobile number" autoFocus />

      <div className="mt-3">
        {debounced.trim().length < 2 ? (
          <p className="text-sm text-ink-500">Type at least two characters, or add a new customer.</p>
        ) : results.loading ? (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Spinner size={14} /> Searching…
          </p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody on file matches “{debounced}”.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {customers.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-ink-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                    {initials(entry.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{entry.full_name}</span>
                    <span className="tabular block text-xs text-ink-400">{formatPhone(entry.phone)}</span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-ink-400">
                    {pluralize(entry.total_visits, "visit")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button onClick={() => setAddOpen(true)} variant="secondary" size="sm" className="mt-3">
        Add a new customer
      </Button>

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initialPhone={looksLikePhone ? search.trim() : undefined}
        onCreated={(created) => {
          setAddOpen(false);
          onPick(created);
        }}
      />
    </div>
  );
}

function SelectedCustomer({ customer, onClear }: { customer: Customer; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
        {initials(customer.full_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink-900">{customer.full_name}</p>
        <p className="tabular text-sm text-ink-500">
          {formatPhone(customer.phone)} · {formatNumber(customer.loyalty_points)} points ·{" "}
          {pluralize(customer.total_visits, "visit")}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link to={`/app/customers/${customer.id}`} className="btn btn-ghost btn-sm">
          History
        </Link>
        <Button onClick={onClear} variant="ghost" size="sm">
          Change
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The bill
// ---------------------------------------------------------------------------

/**
 * Services as tap targets grouped by category.
 *
 * A dropdown of forty services is unusable one-handed; a grid of buttons is what
 * a reception desk actually needs.
 */
function ServiceGrid({ services, onAdd }: { services: Service[]; onAdd: (service: Service) => void }) {
  const grouped = useMemo(() => {
    const groups = new Map<string, Service[]>();
    for (const service of services) {
      const key = service.category ?? "Services";
      const existing = groups.get(key);
      if (existing) existing.push(service);
      else groups.set(key, [service]);
    }
    return [...groups.entries()];
  }, [services]);

  return (
    <div className="space-y-4">
      {grouped.map(([category, entries]) => (
        <div key={category}>
          {grouped.length > 1 ? <p className="stat-label mb-2">{category}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => onAdd(service)}
                className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 px-3.5 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-800">{service.name}</span>
                  <span className="text-xs text-ink-400">{service.duration_minutes} min</span>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-ink-700">
                  {formatPkr(service.price_pkr)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LineItemRow({
  item,
  staff,
  error,
  onChange,
  onRemove
}: {
  item: LineItem;
  staff: Array<{ id: string; name: string }>;
  error?: string;
  onChange: (next: LineItem) => void;
  onRemove: () => void;
}) {
  const lineTotal = Math.max(0, item.unitPricePkr * item.quantity - item.discountPkr);

  return (
    <li className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{item.serviceName}</p>
          <p className="tabular text-sm text-ink-500">{formatPkr(lineTotal)}</p>
        </div>
        <Button onClick={onRemove} variant="ghost" size="sm" title={`Remove ${item.serviceName}`}>
          Remove
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Select
          label="Staff"
          value={item.staffId}
          onChange={(staffId) => onChange({ ...item, staffId })}
          options={[
            { value: "", label: staff.length === 0 ? "No staff added" : "Not recorded" },
            ...staff.map((member) => ({ value: member.id, label: member.name }))
          ]}
          disabled={staff.length === 0}
        />
        <NumberInput
          label="Qty"
          value={item.quantity}
          onChange={(quantity) => onChange({ ...item, quantity: Math.max(1, Math.round(quantity)) })}
          min={1}
          max={20}
        />
        <NumberInput
          label="Price"
          prefix="Rs."
          value={item.unitPricePkr}
          onChange={(unitPricePkr) => onChange({ ...item, unitPricePkr: Math.max(0, Math.round(unitPricePkr)) })}
          min={0}
          error={error}
        />
        <NumberInput
          label="Discount"
          prefix="Rs."
          value={item.discountPkr}
          onChange={(discountPkr) => onChange({ ...item, discountPkr: Math.max(0, Math.round(discountPkr)) })}
          min={0}
        />
      </div>
    </li>
  );
}

/**
 * The running total.
 *
 * Sticky on desktop and pinned to the bottom on a phone, because the receptionist
 * needs the figure to read out and the button to finish without scrolling back up.
 */
function BillSummary({
  customer,
  items,
  subtotal,
  discount,
  total,
  pointsPreview,
  paymentMethod,
  busy,
  onSubmit
}: {
  customer: Customer | null;
  items: LineItem[];
  subtotal: number;
  discount: number;
  total: number;
  pointsPreview: number;
  paymentMethod: PaymentMethod;
  busy: boolean;
  onSubmit: () => void;
}) {
  const ready = Boolean(customer) && items.length > 0;
  const blocker = !customer ? "Choose a customer" : items.length === 0 ? "Add at least one service" : null;

  return (
    <>
      <Card className="hidden lg:sticky lg:top-24 lg:block">
        <CardHeader title="Bill" subtitle={pluralize(items.length, "line")} />
        <CardBody className="space-y-3">
          <Totals subtotal={subtotal} discount={discount} total={total} pointsPreview={pointsPreview} />
          <Button onClick={onSubmit} variant="primary" size="lg" fullWidth busy={busy} disabled={!ready}>
            {paymentMethod === "unpaid" ? "Record unpaid visit" : `Take ${formatPkr(total)}`}
          </Button>
          {blocker ? <p className="text-center text-xs text-ink-500">{blocker}</p> : null}
        </CardBody>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-ink-500">
            {pluralize(items.length, "line")}
            {pointsPreview > 0 ? ` · +${formatNumber(pointsPreview)} points` : ""}
          </span>
          <span className="tabular text-xl font-semibold text-ink-900">{formatPkr(total)}</span>
        </div>
        <Button onClick={onSubmit} variant="primary" size="lg" fullWidth busy={busy} disabled={!ready}>
          {blocker ?? (paymentMethod === "unpaid" ? "Record unpaid visit" : `Take ${formatPkr(total)}`)}
        </Button>
      </div>
    </>
  );
}

function Totals({
  subtotal,
  discount,
  total,
  pointsPreview
}: {
  subtotal: number;
  discount: number;
  total: number;
  pointsPreview: number;
}) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-500">Subtotal</dt>
        <dd className="tabular text-ink-800">{formatPkr(subtotal)}</dd>
      </div>
      {discount > 0 ? (
        <div className="flex justify-between">
          <dt className="text-ink-500">Discount</dt>
          <dd className="tabular text-ink-800">−{formatPkr(discount)}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between border-t border-ink-100 pt-2">
        <dt className="font-medium text-ink-900">Total</dt>
        <dd className="tabular text-2xl font-semibold text-ink-900">{formatPkr(total)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-500">Points earned</dt>
        <dd className="tabular font-medium text-gold-700">+{formatNumber(pointsPreview)}</dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

/**
 * The post-checkout receipt.
 *
 * Rendered from the create response rather than a second fetch, so the number the
 * receptionist reads out is the number the server actually stored. `data-print`
 * promotes just this panel to the paper.
 */
function Receipt({
  visit,
  pointsEarned,
  salonName,
  onNew
}: {
  visit: VisitWithItems;
  pointsEarned: number;
  salonName: string;
  onNew: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="no-print mb-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-2xl">Visit recorded</h1>
        <p className="mt-1 text-sm text-ink-500">
          {visit.customer_name} earned{" "}
          <strong className="font-semibold text-gold-700">{pluralize(pointsEarned, "point")}</strong> on this visit.
        </p>
      </div>

      <section className="card" data-print>
        <div className="px-6 py-6 text-center">
          <p className="text-lg font-semibold text-ink-900">{salonName}</p>
          <p className="mt-0.5 text-sm text-ink-500">{visit.customer_name}</p>
          <p className="tabular text-xs text-ink-400">{formatPhone(visit.customer_phone)}</p>
          <p className="tabular mt-1 text-xs text-ink-400">{formatDateTime(visit.visited_at)}</p>
        </div>

        <div className="border-y border-dashed border-ink-200 px-6 py-4">
          <ul className="space-y-2 text-sm">
            {visit.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-ink-800">
                    {item.service_name}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  {item.staff_name ? <span className="block text-xs text-ink-400">by {item.staff_name}</span> : null}
                </span>
                <span className="tabular shrink-0 text-ink-800">{formatPkr(item.total_pkr)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 py-4">
          <Totals
            subtotal={visit.subtotal_pkr}
            discount={visit.discount_pkr}
            total={visit.total_pkr}
            pointsPreview={visit.points_earned}
          />
          <p className="mt-4 border-t border-ink-100 pt-3 text-center text-xs text-ink-400">
            {visit.payment_status === "unpaid" ? "Unpaid — to be settled" : "Paid, thank you"}
          </p>
        </div>
      </section>

      <div className="no-print mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={onNew} variant="primary">
          Next customer
        </Button>
        <Button onClick={() => window.print()} variant="secondary">
          Print receipt
        </Button>
        <Link to={`/app/customers/${visit.customer_id}`} className="btn btn-ghost">
          Open their record
        </Link>
      </div>
    </div>
  );
}
