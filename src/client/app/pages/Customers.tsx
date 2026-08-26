/**
 * Customer list.
 *
 * Search is the primary interaction: at a reception desk the question is always
 * "is this person already on file?", asked while they are standing there. So the
 * search box takes focus on load, matches on name or number, and the result rows
 * are large enough to tap without aiming.
 */

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useDebounced, useMutation } from "../../lib/hooks";
import { Link, useQueryParam } from "../../lib/router";
import type { Customer } from "../../lib/types";
import {
  formatDate,
  formatNumber,
  formatPhone,
  formatPkr,
  initials,
  relativeDays,
  retentionClass,
  retentionLabel
} from "../../lib/format";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
  TextInput,
  useToast
} from "../../components/ui";
import { useApp } from "../context";
import { CampaignComposer, type CampaignSegmentName } from "../components/CampaignComposer";

const SEGMENTS = [
  { value: "all", label: "Everyone" },
  { value: "at_risk", label: "At risk" },
  { value: "lapsed", label: "Lost" },
  { value: "loyal", label: "Loyal" },
  { value: "new", label: "New" },
  { value: "never_returned", label: "One visit only" },
  { value: "birthday_month", label: "Birthdays" }
] as const;

type Segment = (typeof SEGMENTS)[number]["value"];

const SORTS = [
  { value: "recent", label: "Most recent visit" },
  { value: "spend", label: "Highest lifetime spend" },
  { value: "visits", label: "Most visits" },
  { value: "name", label: "Name (A–Z)" }
] as const;

const PAGE_SIZE = 50;

export function CustomersPage() {
  const { can } = useApp();
  const [segmentParam, setSegmentParam] = useQueryParam("segment");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("recent");
  const [cursor, setCursor] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const segment = (SEGMENTS.find((entry) => entry.value === segmentParam)?.value ?? "all") as Segment;
  const debouncedSearch = useDebounced(search);

  // Any filter change starts a new page run; keeping the old offset would show
  // page 3 of a list that now has one page.
  useEffect(() => setCursor(0), [debouncedSearch, segment, sort]);

  const list = useAsync(
    (signal) =>
      api.get<{ customers: Customer[]; nextCursor: number | null }>(
        "/api/customers",
        { search: debouncedSearch || undefined, segment, sort, limit: PAGE_SIZE, cursor },
        signal
      ),
    [debouncedSearch, segment, sort, cursor]
  );

  const customers = list.data?.customers ?? [];

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title="Customers"
        subtitle="Every visit, every rupee, and when each person is due back."
        actions={
          <>
            {segment !== "all" && can("campaigns") ? (
              <Button onClick={() => setComposerOpen(true)} variant="secondary">
                Message this segment
              </Button>
            ) : null}
            <Button onClick={() => setAddOpen(true)} variant="primary">
              Add customer
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or mobile number"
            autoFocus
          />
        </div>
        <div className="w-56">
          <Select
            label="Sort by"
            labelHidden
            value={sort}
            onChange={setSort}
            options={SORTS.map((entry) => ({ value: entry.value, label: entry.label }))}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Tabs
          value={segment}
          onChange={(value) => setSegmentParam(value === "all" ? null : value)}
          tabs={SEGMENTS.map((entry) => ({ value: entry.value, label: entry.label }))}
        />

        {list.loading && customers.length === 0 ? (
          <LoadingBlock rows={8} />
        ) : list.error ? (
          <EmptyState title="Could not load customers" body={list.error} action={<Button onClick={list.reload}>Try again</Button>} />
        ) : customers.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? `No customer matches “${debouncedSearch}”` : "No customers in this list yet"}
            body={
              debouncedSearch
                ? "Try just the last four digits of the number, or add them as a new customer."
                : "Customers appear here as soon as they scan your QR code or you record their first visit."
            }
            action={<Button onClick={() => setAddOpen(true)} variant="primary">Add customer</Button>}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last visit</th>
                    <th scope="col">Due back</th>
                    <th scope="col" className="text-right">Visits</th>
                    <th scope="col" className="text-right">Lifetime spend</th>
                    <th scope="col" className="text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link
                          to={`/app/customers/${customer.id}`}
                          className="flex items-center gap-3 font-medium text-ink-900 hover:text-brand-700"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                            {initials(customer.full_name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{customer.full_name}</span>
                            <span className="tabular block text-xs font-normal text-ink-400">
                              {formatPhone(customer.phone)}
                              {customer.whatsapp_opt_out_at ? " · opted out" : ""}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={retentionClass(customer.retention_status)}>
                          {retentionLabel(customer.retention_status)}
                        </span>
                      </td>
                      <td className="text-ink-600">{relativeDays(customer.last_visit_at)}</td>
                      <td className="text-ink-600">
                        {customer.expected_return_at ? formatDate(customer.expected_return_at) : "—"}
                        {customer.avg_gap_days ? (
                          <span className="tabular block text-xs text-ink-400">
                            every ~{Math.round(customer.avg_gap_days)} days
                          </span>
                        ) : null}
                      </td>
                      <td className="tabular text-right">{formatNumber(customer.total_visits)}</td>
                      <td className="tabular text-right font-medium">{formatPkr(customer.lifetime_spend_pkr)}</td>
                      <td className="tabular text-right text-gold-700">{formatNumber(customer.loyalty_points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 text-sm sm:px-6">
              <span className="tabular text-ink-500">
                {cursor + 1}–{cursor + customers.length}
                {list.loading ? " · loading…" : ""}
              </span>
              <div className="flex gap-2">
                <Button onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))} disabled={cursor === 0} size="sm">
                  Previous
                </Button>
                <Button
                  onClick={() => setCursor(list.data?.nextCursor ?? cursor)}
                  disabled={!list.data?.nextCursor}
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          list.reload();
          setAddOpen(false);
        }}
      />

      <CampaignComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialSegment={campaignSegmentFor(segment)}
        onSent={list.reload}
      />
    </div>
  );
}

/**
 * Maps a list filter onto the nearest campaign segment.
 *
 * The two vocabularies do not match one-for-one — "loyal" and "new" are useful
 * ways to read the list but not audiences you send a win-back offer to — so the
 * mapping is explicit rather than a cast.
 */
function campaignSegmentFor(segment: Segment): CampaignSegmentName {
  switch (segment) {
    case "at_risk":
      return "at_risk";
    case "lapsed":
      return "lapsed";
    case "never_returned":
      return "never_returned";
    case "birthday_month":
      return "birthday_month";
    case "loyal":
      return "high_value";
    default:
      return "at_risk";
  }
}

/**
 * Adding a customer.
 *
 * The API returns the existing record when the number is already on file rather
 * than a conflict, so a receptionist who does not remember whether someone is
 * enrolled can simply type the number and find out.
 */
export function AddCustomerModal({
  open,
  onClose,
  onCreated,
  initialPhone
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  initialPhone?: string;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: "",
    phone: initialPhone ?? "",
    email: "",
    birthday: "",
    consentWhatsapp: true,
    notes: ""
  });

  useEffect(() => {
    if (open) setForm({ fullName: "", phone: initialPhone ?? "", email: "", birthday: "", consentWhatsapp: true, notes: "" });
  }, [open, initialPhone]);

  const create = useMutation(async () =>
    api.post<{ customer: Customer; created: boolean }>("/api/customers", {
      fullName: form.fullName,
      phone: form.phone,
      email: form.email || undefined,
      birthday: form.birthday || undefined,
      consentWhatsapp: form.consentWhatsapp,
      notes: form.notes || undefined
    })
  );

  const submit = async () => {
    const result = await create.run();
    if (!result) return;
    toast.success(result.created ? "Customer added" : `${result.customer.full_name} was already on file`);
    onCreated(result.customer);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a customer"
      description="Name and mobile number are all that is needed."
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={submit} variant="primary" busy={create.busy} disabled={!form.fullName || !form.phone}>
            Save customer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.error ? (
          <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
            {create.error}
          </p>
        ) : null}

        <TextInput
          label="Full name"
          value={form.fullName}
          onChange={(fullName) => setForm({ ...form, fullName })}
          error={create.fields.fullName}
          autoFocus
          required
        />
        <TextInput
          label="Mobile number"
          hint="Pakistani mobile, e.g. 0300 1234567"
          inputMode="tel"
          value={form.phone}
          onChange={(phone) => setForm({ ...form, phone })}
          error={create.fields.phone}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Email"
            hint="Optional"
            type="email"
            value={form.email}
            onChange={(email) => setForm({ ...form, email })}
            error={create.fields.email}
          />
          <TextInput
            label="Birthday"
            hint="Optional — used for birthday offers"
            type="date"
            value={form.birthday}
            onChange={(birthday) => setForm({ ...form, birthday })}
            error={create.fields.birthday}
          />
        </div>
        <TextInput
          label="Notes"
          hint="Preferences, allergies, anything the team should know"
          value={form.notes}
          onChange={(notes) => setForm({ ...form, notes })}
          error={create.fields.notes}
        />
        <Checkbox
          label="They agreed to receive WhatsApp messages"
          description="Required before Saloona will send them a reminder or an offer. Ask before ticking it."
          checked={form.consentWhatsapp}
          onChange={(consentWhatsapp) => setForm({ ...form, consentWhatsapp })}
        />
        <p className="text-xs leading-5 text-ink-500">
          Messages are sent from your own WhatsApp Business number, never a shared one.
        </p>
      </div>
    </Modal>
  );
}
