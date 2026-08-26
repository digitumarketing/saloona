/**
 * Settings.
 *
 * The WhatsApp tab is the important one and it is written for someone who has
 * never seen a Meta developer console. Saloona sends on the salon's own number and
 * the salon pays Meta directly, which is unusual enough that the screen says so in
 * plain words — an owner who thinks we are reselling messages will ask the wrong
 * questions when an invoice arrives from Meta.
 *
 * Permissions mirror the API exactly: owners edit the business, the branches and
 * the WhatsApp connection; managers can change loyalty and reminder rules. Fields
 * a user cannot save are disabled rather than hidden, so nobody wonders where a
 * setting went.
 */

import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useMutation } from "../../lib/hooks";
import { useQueryParam } from "../../lib/router";
import type { Location, OrgSettings, SettingsPayload } from "../../lib/types";
import { formatDate, formatNumber, formatPkr, formatPhone, pluralize } from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorBlock,
  LoadingBlock,
  Modal,
  NumberInput,
  PageHeader,
  ProgressBar,
  Select,
  Tabs,
  TextInput,
  useToast
} from "../../components/ui";
import { useApp } from "../context";
import { QrPanel } from "../components/QrPanel";
import { brand } from "../../../shared/brand";

const TABS = [
  { value: "business", label: "Business" },
  { value: "loyalty", label: "Loyalty & reminders" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "branches", label: "Branches" },
  { value: "qr", label: "Customer QR" },
  { value: "plan", label: "Plan & usage" }
] as const;

type Tab = (typeof TABS)[number]["value"];

/**
 * Deliberately short. The platform is Pakistan-first, and a 400-entry timezone
 * dropdown is a worse experience than six relevant options plus a support email.
 */
const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York"
];

export function SettingsPage() {
  const { data: bootstrap, refresh } = useApp();
  const [tabParam, setTabParam] = useQueryParam("tab");
  const tab: Tab = TABS.some((entry) => entry.value === tabParam) ? (tabParam as Tab) : "business";

  const state = useAsync((signal) => api.get<SettingsPayload>("/api/settings", undefined, signal), []);

  const role = bootstrap.user.role;
  const isOwner = role === "owner";
  const canManage = role === "owner" || role === "manager";

  const reloadAll = () => {
    state.reload();
    // The bootstrap payload carries the loyalty rate the checkout screen uses to
    // preview points, so it has to be refetched alongside.
    refresh();
  };

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title="Settings"
        subtitle={
          isOwner
            ? "You are the account owner, so everything here is editable."
            : `You are signed in as a ${role}. Some settings are owner-only.`
        }
      />

      <Card>
        <Tabs value={tab} onChange={(next) => setTabParam(next)} tabs={TABS.map((entry) => ({ ...entry }))} />

        {state.loading && !state.data ? (
          <LoadingBlock rows={8} />
        ) : state.error || !state.data ? (
          <ErrorBlock message={state.error ?? "Settings could not be loaded."} onRetry={state.reload} />
        ) : tab === "business" ? (
          <BusinessTab payload={state.data} isOwner={isOwner} onSaved={reloadAll} />
        ) : tab === "loyalty" ? (
          <LoyaltyTab payload={state.data} canManage={canManage} onSaved={reloadAll} />
        ) : tab === "whatsapp" ? (
          <WhatsappTab payload={state.data} isOwner={isOwner} onChanged={reloadAll} />
        ) : tab === "branches" ? (
          <BranchesTab payload={state.data} isOwner={isOwner} onChanged={reloadAll} />
        ) : tab === "qr" ? (
          <QrTab payload={state.data} />
        ) : (
          <PlanTab payload={state.data} />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

function BusinessTab({
  payload,
  isOwner,
  onSaved
}: {
  payload: SettingsPayload;
  isOwner: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: payload.organization.name,
    phone: payload.profile.phone ?? "",
    timezone: payload.organization.timezone,
    logoUrl: payload.profile.logoUrl ?? ""
  }));

  const save = useMutation(async () => {
    // Empty optional fields are omitted rather than sent as "", which the schema
    // would reject as an invalid phone number or URL.
    const body: Record<string, string> = { name: form.name.trim(), timezone: form.timezone };
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.logoUrl.trim()) body.logoUrl = form.logoUrl.trim();
    return api.patch<{ ok: true }>("/api/settings/organization", body);
  });

  const submit = async () => {
    const result = await save.run();
    if (!result) return;
    toast.success("Business details saved.");
    onSaved();
  };

  const options = (TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((zone) => ({
    value: zone,
    label: zone.replace("_", " ")
  }));

  return (
    <CardBody className="max-w-xl space-y-5">
      <TextInput
        label="Business name"
        value={form.name}
        onChange={(name) => setForm({ ...form, name })}
        error={save.fields.name}
        disabled={!isOwner}
        required
        hint="Appears on receipts, on the customer wallet, and in every WhatsApp message."
      />

      <TextInput
        label="Business phone"
        value={form.phone}
        onChange={(phone) => setForm({ ...form, phone })}
        error={save.fields.phone}
        disabled={!isOwner}
        type="tel"
        inputMode="tel"
        placeholder="0300 1234567"
        hint="Shown to customers on the wallet so they can call you."
      />

      <Select
        label="Timezone"
        value={form.timezone}
        onChange={(timezone) => setForm({ ...form, timezone })}
        options={options}
        disabled={!isOwner}
        error={save.fields.timezone}
        hint="Decides when a business day starts and ends in your reports."
      />

      <TextInput
        label="Logo URL"
        value={form.logoUrl}
        onChange={(logoUrl) => setForm({ ...form, logoUrl })}
        error={save.fields.logoUrl}
        disabled={!isOwner}
        placeholder="https://…"
        hint="Optional. Used on the customer wallet and the printed desk card."
      />

      <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-600">
        Your public wallet address is{" "}
        <span className="font-mono text-ink-800">/j/{payload.organization.slug}</span>. Changing it would break every
        printed QR code, so it is fixed — email {brand.supportEmail} if you need it changed.
      </div>

      {save.error ? <p className="error-text">{save.error}</p> : null}

      {isOwner ? (
        <div>
          <Button onClick={submit} variant="primary" busy={save.busy}>
            Save changes
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-500">Only the account owner can change these details.</p>
      )}
    </CardBody>
  );
}

// ---------------------------------------------------------------------------
// Loyalty and reminders
// ---------------------------------------------------------------------------

function LoyaltyTab({
  payload,
  canManage,
  onSaved
}: {
  payload: SettingsPayload;
  canManage: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<OrgSettings>(() => ({ ...payload.settings }));

  const saveLoyalty = useMutation(async () =>
    api.patch<{ settings: OrgSettings }>("/api/settings/loyalty", {
      pointsPerHundredPkr: form.pointsPerHundredPkr,
      defaultReturnDays: form.defaultReturnDays,
      atRiskMultiplier: form.atRiskMultiplier
    })
  );

  const saveMessaging = useMutation(async () =>
    api.patch<{ settings: OrgSettings }>("/api/settings/messaging", {
      // The reminder toggle is accepted by both endpoints; sending it only here
      // keeps one owner for the value.
      reminderEnabled: form.reminderEnabled,
      reviewRequestEnabled: form.reviewRequestEnabled,
      reviewUrl: form.reviewUrl?.trim() ?? "",
      messageSignature: form.messageSignature?.trim() ?? ""
    })
  );

  const submit = async () => {
    // Two endpoints, one button: the split exists on the server because the two
    // groups have different validation, not because an owner thinks of them as
    // two separate saves.
    const first = await saveLoyalty.run();
    if (!first) return;
    const second = await saveMessaging.run();
    if (!second) return;
    setForm(second.settings);
    toast.success("Saved.");
    onSaved();
  };

  const busy = saveLoyalty.busy || saveMessaging.busy;
  const error = saveLoyalty.error ?? saveMessaging.error;
  const fields = { ...saveLoyalty.fields, ...saveMessaging.fields };

  // The worked example is what makes the points rate concrete. An owner setting
  // "1 point per 100" wants to know what a Rs. 2,500 bill earns.
  const examplePoints = Math.floor((2500 / 100) * form.pointsPerHundredPkr);

  return (
    <CardBody className="max-w-xl space-y-8">
      <section className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Loyalty points</h3>
          <p className="mt-1 text-sm text-ink-500">How fast customers earn towards a reward.</p>
        </div>

        <NumberInput
          label="Points per PKR 100 spent"
          value={form.pointsPerHundredPkr}
          onChange={(pointsPerHundredPkr) => setForm({ ...form, pointsPerHundredPkr })}
          min={0}
          max={1000}
          disabled={!canManage}
          error={fields.pointsPerHundredPkr}
          hint={`A ${formatPkr(2500)} bill earns ${pluralize(examplePoints, "point")}.`}
        />

        <NumberInput
          label="Return window (days)"
          value={form.defaultReturnDays}
          onChange={(defaultReturnDays) => setForm({ ...form, defaultReturnDays })}
          min={7}
          max={365}
          disabled={!canManage}
          error={fields.defaultReturnDays}
          hint="Used only for customers with fewer than two visits. After that, each customer's own median gap is used instead."
        />

        <NumberInput
          label="At-risk multiplier"
          value={form.atRiskMultiplier}
          onChange={(atRiskMultiplier) => setForm({ ...form, atRiskMultiplier })}
          min={1}
          max={5}
          step={0.1}
          disabled={!canManage}
          error={fields.atRiskMultiplier}
          hint={`A customer becomes "at risk" once they are ${form.atRiskMultiplier}× past their usual gap. Lower catches people sooner and messages more often.`}
        />
      </section>

      <section className="space-y-5 border-t border-ink-100 pt-8">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Automatic messages</h3>
          <p className="mt-1 text-sm text-ink-500">Sent from your own WhatsApp Business number.</p>
        </div>

        <Checkbox
          label="Send return reminders"
          description="One message when a customer passes their usual gap between visits. Nobody is messaged twice in the same window."
          checked={form.reminderEnabled}
          onChange={(reminderEnabled) => setForm({ ...form, reminderEnabled })}
          disabled={!canManage}
        />

        <Checkbox
          label="Ask for a Google review after a visit"
          description="Only sent to customers who consented, and only once."
          checked={form.reviewRequestEnabled}
          onChange={(reviewRequestEnabled) => setForm({ ...form, reviewRequestEnabled })}
          disabled={!canManage}
        />

        {form.reviewRequestEnabled ? (
          <TextInput
            label="Review link"
            value={form.reviewUrl ?? ""}
            onChange={(reviewUrl) => setForm({ ...form, reviewUrl })}
            disabled={!canManage}
            error={fields.reviewUrl}
            placeholder="https://g.page/r/…"
            hint="Your Google Business review link. Without it, review requests are not sent."
          />
        ) : null}

        <TextInput
          label="Message signature"
          value={form.messageSignature ?? ""}
          onChange={(messageSignature) => setForm({ ...form, messageSignature })}
          disabled={!canManage}
          maxLength={200}
          error={fields.messageSignature}
          placeholder={`${payload.organization.name}, Gulberg`}
          hint="Added to the end of automated messages so a customer knows immediately who is writing."
        />
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {canManage ? (
        <div>
          <Button onClick={submit} variant="primary" busy={busy}>
            Save settings
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-500">Only an owner or manager can change these.</p>
      )}
    </CardBody>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

const WHATSAPP_STATUS: Record<string, { label: string; className: string }> = {
  connected: { label: "Connected", className: "badge-active" },
  active: { label: "Connected", className: "badge-active" },
  error: { label: "Needs attention", className: "badge-lost" },
  not_connected: { label: "Not connected", className: "badge-neutral" }
};

function WhatsappTab({
  payload,
  isOwner,
  onChanged
}: {
  payload: SettingsPayload;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const connected = payload.whatsapp.status !== "not_connected";
  const status = WHATSAPP_STATUS[payload.whatsapp.status] ?? {
    label: payload.whatsapp.status,
    className: "badge-neutral"
  };

  const disconnect = useMutation(async () => api.delete<{ ok: true }>("/api/settings/whatsapp"));

  const runDisconnect = async () => {
    const result = await disconnect.run();
    if (!result) {
      toast.error(disconnect.error ?? "Could not disconnect.");
      return;
    }
    setConfirmDisconnect(false);
    toast.success("WhatsApp disconnected. Messages will queue until you reconnect.");
    onChanged();
  };

  return (
    <CardBody className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-ink-100 bg-ink-50/60 p-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={status.className}>{status.label}</span>
            {payload.whatsapp.displayPhone ? (
              <span className="font-medium text-ink-900">{formatPhone(payload.whatsapp.displayPhone)}</span>
            ) : null}
          </div>
          {payload.whatsapp.connectedAt ? (
            <p className="mt-2 text-sm text-ink-500">Connected {formatDate(payload.whatsapp.connectedAt)}</p>
          ) : (
            <p className="mt-2 max-w-lg text-sm leading-6 text-ink-600">
              Until this is connected, reminders and campaigns are queued rather than lost. Nothing is sent from a shared
              number — it is always yours.
            </p>
          )}
          {payload.whatsapp.lastError ? (
            <p className="mt-2 max-w-lg text-sm text-red-700">Last error from Meta: {payload.whatsapp.lastError}</p>
          ) : null}
        </div>

        {isOwner ? (
          <div className="flex gap-2">
            <Button onClick={() => setConnecting(true)} variant={connected ? "secondary" : "primary"}>
              {connected ? "Update credentials" : "Connect WhatsApp"}
            </Button>
            {connected ? (
              <Button onClick={() => setConfirmDisconnect(true)} variant="ghost">
                Disconnect
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="max-w-2xl space-y-4 text-sm leading-6 text-ink-700">
        <h3 className="text-sm font-semibold text-ink-900">How this works, and what it costs you</h3>
        <p>
          Saloona sends through the WhatsApp Cloud API using <strong className="font-semibold">your</strong> WhatsApp
          Business number. Customers see your salon's name, replies come to your own WhatsApp inbox, and the conversation
          history stays yours.
        </p>
        <p>
          Meta charges for messages and bills you directly. Your Saloona subscription covers the software, not the
          message fees — which is why we do not mark them up and why your monthly allowance is a fair-use limit rather
          than a bundle of purchased messages.
        </p>
        <p>
          You will need a Meta Business account with a verified business, a WhatsApp Business number that is not already
          in the consumer WhatsApp app, and approved message templates. If that sounds like a lot, email{" "}
          <a className="font-medium text-brand-700 hover:underline" href={`mailto:${brand.supportEmail}`}>
            {brand.supportEmail}
          </a>{" "}
          and we will set it up with you.
        </p>
      </section>

      {connecting ? (
        <ConnectWhatsappModal
          onClose={() => setConnecting(false)}
          onConnected={() => {
            setConnecting(false);
            onChanged();
          }}
        />
      ) : null}

      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect WhatsApp?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmDisconnect(false)} variant="ghost">
              Keep connected
            </Button>
            <Button onClick={runDisconnect} variant="danger" busy={disconnect.busy}>
              Disconnect
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-ink-600">
          Your stored credentials are deleted. Reminders and campaigns keep queueing and will send when you reconnect —
          nothing in your customer records changes.
        </p>
      </Modal>
    </CardBody>
  );
}

function ConnectWhatsappModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ phoneNumberId: "", wabaId: "", accessToken: "", displayPhone: "" });

  const connect = useMutation(async () =>
    api.post<{ ok: true; displayPhone: string | null; templates: Array<{ name: string }> }>(
      "/api/settings/whatsapp",
      form
    )
  );

  const submit = async () => {
    const result = await connect.run();
    if (!result) return;
    toast.success(
      result.templates.length > 0
        ? `Connected. ${pluralize(result.templates.length, "approved template")} found.`
        : "Connected. No approved templates yet — Meta must approve them before messages can send."
    );
    onConnected();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Connect your WhatsApp Business number"
      description="These come from your Meta Business account. We check them with Meta before saving."
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={submit} variant="primary" busy={connect.busy}>
            Verify and connect
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Phone number ID"
          value={form.phoneNumberId}
          onChange={(phoneNumberId) => setForm({ ...form, phoneNumberId })}
          error={connect.fields.phoneNumberId}
          required
          inputMode="numeric"
          hint="A long number from Meta's WhatsApp API setup page. Not the phone number itself."
        />
        <TextInput
          label="WhatsApp Business Account ID"
          value={form.wabaId}
          onChange={(wabaId) => setForm({ ...form, wabaId })}
          error={connect.fields.wabaId}
          required
          inputMode="numeric"
          hint="Also on the API setup page, labelled WABA ID."
        />
        <TextInput
          label="Permanent access token"
          value={form.accessToken}
          onChange={(accessToken) => setForm({ ...form, accessToken })}
          error={connect.fields.accessToken}
          required
          type="password"
          hint="Create a system user token so it does not expire. It is encrypted before storage and never shown again."
        />
        <TextInput
          label="Your WhatsApp Business number"
          value={form.displayPhone}
          onChange={(displayPhone) => setForm({ ...form, displayPhone })}
          error={connect.fields.displayPhone}
          required
          type="tel"
          inputMode="tel"
          placeholder="0300 1234567"
          hint="The number customers will see the message come from."
        />

        {connect.error ? <p className="error-text">{connect.error}</p> : null}

        <p className="rounded-xl bg-gold-50 px-4 py-3 text-xs leading-5 text-gold-700">
          Treat the access token like a password. Anyone holding it can send messages as your business.
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

function BranchesTab({
  payload,
  isOwner,
  onChanged
}: {
  payload: SettingsPayload;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const allowed = payload.plan.limits.locations;
  const atLimit = payload.locations.length >= allowed;

  return (
    <>
      <CardHeader
        title={pluralize(payload.locations.length, "branch", "branches")}
        subtitle={`Your ${payload.plan.name} plan includes ${allowed}.`}
        action={
          isOwner ? (
            <Button onClick={() => setAdding(true)} variant="primary" size="sm" disabled={atLimit}>
              Add branch
            </Button>
          ) : undefined
        }
      />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Branch</th>
              <th scope="col">City</th>
              <th scope="col">Address</th>
              <th scope="col">Phone</th>
            </tr>
          </thead>
          <tbody>
            {payload.locations.map((location) => (
              <tr key={location.id}>
                <td className="font-medium text-ink-900">{location.name}</td>
                <td className="text-ink-600">{location.city ?? "—"}</td>
                <td className="text-ink-600">{location.address ?? "—"}</td>
                <td className="text-ink-600">{location.phone ? formatPhone(location.phone) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {atLimit ? (
        <CardBody className="border-t border-ink-100">
          <p className="text-sm leading-6 text-ink-600">
            You are using all {pluralize(allowed, "branch", "branches")} included in {payload.plan.name}. A larger plan
            adds more — email {brand.supportEmail} and we will move you across.
          </p>
        </CardBody>
      ) : null}

      {adding ? (
        <AddBranchModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function AddBranchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", city: "", address: "", phone: "" });

  const create = useMutation(async () => {
    const body: Record<string, string> = { name: form.name.trim() };
    if (form.city.trim()) body.city = form.city.trim();
    if (form.address.trim()) body.address = form.address.trim();
    if (form.phone.trim()) body.phone = form.phone.trim();
    return api.post<{ location: Location }>("/api/settings/locations", body);
  });

  const submit = async () => {
    const result = await create.run();
    if (!result) return;
    toast.success(`${result.location.name} added.`);
    onCreated();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a branch"
      description="Staff and visits can then be recorded against it separately."
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={submit} variant="primary" busy={create.busy}>
            Add branch
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Branch name"
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          error={create.fields.name}
          required
          autoFocus
          placeholder="Gulberg"
        />
        <TextInput
          label="City"
          value={form.city}
          onChange={(city) => setForm({ ...form, city })}
          error={create.fields.city}
          placeholder="Lahore"
        />
        <TextInput
          label="Address"
          value={form.address}
          onChange={(address) => setForm({ ...form, address })}
          error={create.fields.address}
        />
        <TextInput
          label="Phone"
          value={form.phone}
          onChange={(phone) => setForm({ ...form, phone })}
          error={create.fields.phone}
          type="tel"
          inputMode="tel"
        />
        {create.error ? <p className="error-text">{create.error}</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Customer QR
// ---------------------------------------------------------------------------

function QrTab({ payload }: { payload: SettingsPayload }) {
  return (
    <>
      <CardHeader
        title="Your customer QR code"
        subtitle="Put this on the reception desk, the mirror, and the back of your card."
      />
      <CardBody>
        <QrPanel url={payload.joinUrl} salonName={payload.organization.name} />
      </CardBody>
    </>
  );
}

// ---------------------------------------------------------------------------
// Plan and usage
// ---------------------------------------------------------------------------

function PlanTab({ payload }: { payload: SettingsPayload }) {
  const { plan, organization, usage } = payload;
  const trialing = organization.status === "trialing";

  return (
    <>
      <CardHeader title={`${plan.name} plan`} subtitle={plan.summary} />
      <CardBody className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold text-ink-900">
              {formatPkr(plan.pricePkr)}
              <span className="text-base font-normal text-ink-500"> / month</span>
            </p>
            {trialing && organization.trialEndsAt ? (
              <p className="mt-1.5 text-sm text-ink-500">
                Free trial until {formatDate(organization.trialEndsAt)}. No card is held.
              </p>
            ) : organization.status === "past_due" ? (
              <p className="mt-1.5 text-sm font-medium text-red-700">Payment is overdue. Automated messages are paused.</p>
            ) : (
              <p className="mt-1.5 text-sm text-ink-500">Billed monthly. Cancel whenever you like.</p>
            )}
          </div>
          <a href={`mailto:${brand.supportEmail}?subject=Saloona plan change`} className="btn btn-primary">
            Change plan
          </a>
        </div>

        <section className="space-y-5 border-t border-ink-100 pt-8">
          <h3 className="text-sm font-semibold text-ink-900">This month's usage</h3>
          <ProgressBar
            used={usage.messagesThisMonth}
            total={usage.messageAllowance}
            label="Automated WhatsApp messages"
          />
          <p className="text-sm leading-6 text-ink-600">
            {usage.messagesThisMonth >= usage.messageAllowance
              ? "You have used your fair-use allowance for this month. Automated messages resume on the 1st, or move up a plan to lift the limit."
              : `${formatNumber(usage.messageAllowance - usage.messagesThisMonth)} left this month. Meta bills you separately for the message fees themselves.`}
          </p>

          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <LimitLine label="Branches" used={payload.locations.length} limit={plan.limits.locations} />
            <LimitLine label="Team members" limit={plan.limits.staff} />
            <LimitLine label="Customers" limit={plan.limits.customers} />
            <LimitLine label="Campaigns per month" limit={plan.limits.campaignsPerMonth} />
          </dl>
        </section>

        <section className="space-y-3 border-t border-ink-100 pt-8">
          <h3 className="text-sm font-semibold text-ink-900">What {plan.name} includes</h3>
          <ul className="grid gap-2 text-sm text-ink-700 sm:grid-cols-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <svg
                  className="mt-0.5 size-4 shrink-0 text-brand-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 0 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
          <p className="pt-2 text-sm text-ink-500">
            Full comparison on the{" "}
            <a href="/pricing" target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
              pricing page
            </a>
            .
          </p>
        </section>
      </CardBody>
    </>
  );
}

function LimitLine({ label, used, limit }: { label: string; used?: number; limit: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular font-medium text-ink-800">
        {used === undefined ? `Up to ${formatNumber(limit)}` : `${formatNumber(used)} of ${formatNumber(limit)}`}
      </dd>
    </div>
  );
}
