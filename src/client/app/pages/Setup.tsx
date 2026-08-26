/**
 * Onboarding.
 *
 * A salon that signs up on Tuesday afternoon has ten minutes between customers.
 * The wizard is therefore four steps that each produce something usable on their
 * own — services, staff, the QR code, WhatsApp — rather than one long form that
 * has to be finished before the app does anything.
 *
 * `SetupChecklist` is the same state rendered compactly on the dashboard, so
 * progress is visible without navigating back here.
 */

import { useState } from "react";
import { api } from "../../lib/api";
import { useMutation } from "../../lib/hooks";
import { Link, navigate } from "../../lib/router";
import type { Service, Staff } from "../../lib/types";
import { formatPkr } from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  NumberInput,
  PageHeader,
  TextInput,
  useToast
} from "../../components/ui";
import { useApp } from "../context";
import { QrPanel } from "../components/QrPanel";

/** Starter services for a Pakistani salon, so step one is two taps not ten. */
const SUGGESTED_SERVICES = [
  { name: "Haircut", durationMinutes: 45, pricePkr: 1200, category: "Hair" },
  { name: "Beard trim", durationMinutes: 20, pricePkr: 500, category: "Hair" },
  { name: "Hair colour", durationMinutes: 120, pricePkr: 6000, category: "Hair" },
  { name: "Blow dry", durationMinutes: 40, pricePkr: 1500, category: "Hair" },
  { name: "Threading", durationMinutes: 15, pricePkr: 400, category: "Beauty" },
  { name: "Facial", durationMinutes: 60, pricePkr: 3500, category: "Beauty" },
  { name: "Manicure", durationMinutes: 45, pricePkr: 1800, category: "Nails" },
  { name: "Bridal makeup", durationMinutes: 180, pricePkr: 35_000, category: "Bridal" }
];

interface StepState {
  hasServices: boolean;
  hasStaff: boolean;
  hasCustomers: boolean;
  whatsappConnected: boolean;
}

export function SetupPage() {
  const { data, refresh } = useApp();
  const toast = useToast();
  const [step, setStep] = useState(() => firstIncompleteStep(data.setup));

  const complete = useMutation(async () => {
    await api.post("/api/onboarding/complete");
  });

  const finish = async () => {
    const result = await complete.run();
    if (result === null && complete.error) {
      toast.error(complete.error);
      return;
    }
    refresh();
    toast.success("Setup complete. Your salon is live.");
    navigate("/app");
  };

  const steps = [
    { id: 0, label: "Services", done: data.setup.hasServices },
    { id: 1, label: "Team", done: data.setup.hasStaff },
    { id: 2, label: "Customer QR", done: data.setup.hasCustomers },
    { id: 3, label: "WhatsApp", done: false }
  ];

  return (
    <div className="mx-auto max-w-3xl pb-20 lg:pb-0">
      <PageHeader
        title="Set up your salon"
        subtitle="Four steps. You can leave and come back — nothing is lost."
      />

      <ol className="mb-6 flex gap-2" aria-label="Setup progress">
        {steps.map((entry) => (
          <li key={entry.id} className="flex-1">
            <button
              type="button"
              onClick={() => setStep(entry.id)}
              className={`w-full rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                step === entry.id
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : entry.done
                    ? "border-ink-100 bg-white text-ink-500"
                    : "border-ink-100 bg-white text-ink-400"
              }`}
              aria-current={step === entry.id ? "step" : undefined}
            >
              <span className="mr-1">{entry.done ? "✓" : entry.id + 1}</span>
              {entry.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? <ServicesStep onNext={() => setStep(1)} /> : null}
      {step === 1 ? <StaffStep onNext={() => setStep(2)} /> : null}
      {step === 2 ? <QrStep onNext={() => setStep(3)} /> : null}
      {step === 3 ? <WhatsappStep onFinish={finish} busy={complete.busy} /> : null}
    </div>
  );
}

function firstIncompleteStep(setup: StepState | { hasServices: boolean; hasStaff: boolean; hasCustomers: boolean }): number {
  if (!setup.hasServices) return 0;
  if (!setup.hasStaff) return 1;
  if (!setup.hasCustomers) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Step 1 — services
// ---------------------------------------------------------------------------

function ServicesStep({ onNext }: { onNext: () => void }) {
  const { data, refresh } = useApp();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(["Haircut", "Beard trim", "Facial"]));
  const [custom, setCustom] = useState({ name: "", pricePkr: 1000 });

  const existing = new Set(data.services.map((service) => service.name.toLowerCase()));

  const addSelected = useMutation(async () => {
    const chosen = SUGGESTED_SERVICES.filter(
      (service) => selected.has(service.name) && !existing.has(service.name.toLowerCase())
    );
    // Sequential rather than parallel: D1 handles a burst of writes from one
    // Worker request poorly, and eight services is not worth the risk.
    for (const service of chosen) {
      await api.post<{ service: Service }>("/api/catalog/services", service);
    }
    return chosen.length;
  });

  const addCustom = useMutation(async () => {
    await api.post<{ service: Service }>("/api/catalog/services", {
      name: custom.name,
      pricePkr: custom.pricePkr,
      durationMinutes: 45
    });
  });

  return (
    <Card>
      <CardHeader
        title="What do you charge for?"
        subtitle="Pick the ones you offer. You can change prices any time."
      />
      <CardBody className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {SUGGESTED_SERVICES.map((service) => {
            const already = existing.has(service.name.toLowerCase());
            const checked = already || selected.has(service.name);
            return (
              <label
                key={service.name}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  checked ? "border-brand-400 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                } ${already ? "cursor-default opacity-70" : ""}`}
              >
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={checked}
                  disabled={already}
                  onChange={(event) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(service.name);
                      else next.delete(service.name);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{service.name}</span>
                  <span className="tabular block text-xs text-ink-500">
                    {formatPkr(service.pricePkr)} · {service.durationMinutes} min
                  </span>
                </span>
                {already ? <span className="badge-active shrink-0">Added</span> : null}
              </label>
            );
          })}
        </div>

        {addSelected.error ? <p className="error-text">{addSelected.error}</p> : null}

        <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
          <p className="mb-3 text-sm font-medium text-ink-800">Something not on the list?</p>
          <div className="flex flex-wrap items-end gap-3">
            <TextInput
              label="Service name"
              value={custom.name}
              onChange={(name) => setCustom({ ...custom, name })}
              className="min-w-40 flex-1"
              error={addCustom.fields.name}
            />
            <NumberInput
              label="Price"
              prefix="Rs."
              value={custom.pricePkr}
              onChange={(pricePkr) => setCustom({ ...custom, pricePkr })}
              min={0}
              className="w-36"
              error={addCustom.fields.pricePkr}
            />
            <Button
              onClick={async () => {
                if (!custom.name.trim()) return;
                const result = await addCustom.run();
                if (result === null && (addCustom.error || Object.keys(addCustom.fields).length)) return;
                setCustom({ name: "", pricePkr: 1000 });
                refresh();
                toast.success("Service added");
              }}
              busy={addCustom.busy}
              variant="secondary"
            >
              Add
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
          <Button onClick={onNext} variant="ghost">
            Skip for now
          </Button>
          <Button
            onClick={async () => {
              const added = await addSelected.run();
              if (added === null) return;
              refresh();
              if (added > 0) toast.success(`${added} services added`);
              onNext();
            }}
            variant="primary"
            busy={addSelected.busy}
          >
            Add and continue
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — staff
// ---------------------------------------------------------------------------

function StaffStep({ onNext }: { onNext: () => void }) {
  const { data, refresh } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", role: "Stylist", phone: "" });

  const add = useMutation(async () => {
    await api.post<{ staff: Staff }>("/api/catalog/staff", {
      name: form.name,
      role: form.role || undefined,
      phone: form.phone || undefined
    });
  });

  return (
    <Card>
      <CardHeader
        title="Who works with you?"
        subtitle="Adding your team lets each bill record who did the work — that is what makes staff reports possible."
      />
      <CardBody className="space-y-5">
        {data.staff.length > 0 ? (
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {data.staff.map((member) => (
              <li key={member.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-ink-900">{member.name}</span>
                <span className="text-xs text-ink-500">{member.role ?? "Staff"}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput
            label="Name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            error={add.fields.name}
            required
          />
          <TextInput label="Role" value={form.role} onChange={(role) => setForm({ ...form, role })} />
          <TextInput
            label="Phone"
            hint="Optional"
            inputMode="tel"
            value={form.phone}
            onChange={(phone) => setForm({ ...form, phone })}
            error={add.fields.phone}
          />
        </div>

        {add.error ? <p className="error-text">{add.error}</p> : null}

        <div className="flex flex-wrap justify-between gap-2 border-t border-ink-100 pt-4">
          <Button
            onClick={async () => {
              if (!form.name.trim()) return;
              const result = await add.run();
              if (result === null) return;
              setForm({ name: "", role: "Stylist", phone: "" });
              refresh();
              toast.success("Added to your team");
            }}
            busy={add.busy}
            variant="secondary"
          >
            Add another
          </Button>
          <Button onClick={onNext} variant="primary">
            Continue
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — the QR code
// ---------------------------------------------------------------------------

function QrStep({ onNext }: { onNext: () => void }) {
  const { data } = useApp();
  return (
    <Card>
      <CardHeader
        title="Put this on your reception desk"
        subtitle="Customers scan it, enter their name and number, and their points card lives on their phone. No app to install."
      />
      <CardBody className="space-y-5">
        <QrPanel url={data.joinUrl} salonName={data.organization.name} />
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button onClick={onNext} variant="primary">
            Continue
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — WhatsApp
// ---------------------------------------------------------------------------

function WhatsappStep({ onFinish, busy }: { onFinish: () => void; busy: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Connect your WhatsApp Business number"
        subtitle="Messages go out from your number, so customers recognise who is writing — and the Meta charges stay on your own account."
      />
      <CardBody className="space-y-5">
        <ol className="space-y-3 text-sm leading-6 text-ink-600">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              1
            </span>
            Create a Meta Business account and add your salon's WhatsApp number to WhatsApp Manager.
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              2
            </span>
            Submit the six message templates. Saloona gives you the exact wording to paste in.
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              3
            </span>
            Paste your Phone Number ID, WhatsApp Business Account ID, and access token into Settings.
          </li>
        </ol>

        <p className="rounded-xl bg-gold-100 px-4 py-3 text-sm leading-6 text-gold-700">
          This step needs Meta's approval, which usually takes a day or two. Everything else in Saloona works while you
          wait — you can record visits and award points from today.
        </p>

        <div className="flex flex-wrap justify-between gap-2 border-t border-ink-100 pt-4">
          <Link to="/app/settings" className="btn btn-secondary">
            Open WhatsApp settings
          </Link>
          <Button onClick={onFinish} variant="primary" busy={busy}>
            Finish setup
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard checklist
// ---------------------------------------------------------------------------

export function SetupChecklist({ compact }: { compact?: boolean }) {
  const { data } = useApp();
  const items = [
    { label: "Add your services", done: data.setup.hasServices },
    { label: "Add your team", done: data.setup.hasStaff },
    { label: "Get your first customer on the QR code", done: data.setup.hasCustomers },
    { label: "Record your first visit", done: data.setup.hasVisits }
  ];
  const remaining = items.filter((item) => !item.done).length;
  if (remaining === 0) return null;

  return (
    <Card className={compact ? "border-brand-200 bg-brand-50/40" : undefined}>
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {items.length - remaining} of {items.length} setup steps done
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {items.map((item) => (
              <li key={item.label} className={item.done ? "text-ink-400 line-through" : "text-ink-600"}>
                {item.done ? "✓ " : "• "}
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <Link to="/app/setup" className="btn btn-primary btn-sm shrink-0">
          Continue setup
        </Link>
      </CardBody>
    </Card>
  );
}
