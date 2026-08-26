/**
 * Win-back campaign composer.
 *
 * Two steps, deliberately: compose, then confirm against a live audience count.
 * A one-click bulk send to a mis-selected segment costs the salon real money with
 * Meta and their customers' goodwill, so the confirm step always states how many
 * people will be messaged and whether that fits the month's allowance.
 *
 * Shared by the dashboard's at-risk panel and the campaigns screen, so the
 * headline "[Send win-back campaign]" button and the full campaigns page cannot
 * drift apart.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useMutation } from "../../lib/hooks";
import { formatNumber, formatPhone, pluralize } from "../../lib/format";
import type { AudiencePreview, Campaign, MessageTemplate } from "../../lib/types";
import { Button, Modal, ProgressBar, Select, Textarea, TextInput, Spinner, useToast } from "../../components/ui";
import { useApp } from "../context";
import { navigate } from "../../lib/router";

const SEGMENTS = [
  { value: "at_risk", label: "At risk — overdue against their own pattern" },
  { value: "lapsed", label: "Lapsed — not seen in a long time" },
  { value: "never_returned", label: "Never returned — one visit only" },
  { value: "high_value", label: "High value — your biggest spenders" },
  { value: "birthday_month", label: "Birthdays this month" },
  { value: "all", label: "Everyone who has consented" }
] as const;

type Segment = (typeof SEGMENTS)[number]["value"];

/** Exported so callers can map their own filter vocabulary onto a campaign segment. */
export type CampaignSegmentName = Segment;

export function CampaignComposer({
  open,
  onClose,
  initialSegment = "at_risk",
  onSent
}: {
  open: boolean;
  onClose: () => void;
  initialSegment?: Segment;
  onSent?: () => void;
}) {
  const { data, can } = useApp();
  const toast = useToast();

  const [step, setStep] = useState<"compose" | "confirm">("compose");
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [name, setName] = useState("");
  const [offer, setOffer] = useState("20% off your next visit");
  const [body, setBody] = useState("");
  const [templateKey, setTemplateKey] = useState("win_back");

  const templates = useAsync(
    (signal) => api.get<{ templates: MessageTemplate[] }>("/api/campaigns/templates", undefined, signal),
    []
  );

  const audience = useAsync(
    (signal) =>
      open ? api.get<AudiencePreview>("/api/campaigns/audience", { segment }, signal) : Promise.resolve(null),
    [open, segment]
  );

  const marketingTemplates = useMemo(
    () => (templates.data?.templates ?? []).filter((template) => template.category === "MARKETING"),
    [templates.data]
  );

  // Seed the wording from the selected Meta template rather than an empty box:
  // an owner staring at a blank message field sends nothing.
  useEffect(() => {
    const template = marketingTemplates.find((entry) => entry.key === templateKey);
    if (!template) return;
    setBody(
      template.body
        .replace("${customer_name}", "{{name}}")
        .replace("${business_name}", data.organization.name)
        .replace("${offer}", offer || "a special welcome back")
        .replace("${service_name}", "visit")
    );
    // Offer is intentionally not a dependency: retyping the offer should not
    // silently overwrite wording the owner has edited by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, marketingTemplates, data.organization.name]);

  useEffect(() => {
    if (!open) return;
    setStep("compose");
    setSegment(initialSegment);
    const label = SEGMENTS.find((entry) => entry.value === initialSegment)?.label ?? "Win-back";
    setName(`${label.split("—")[0]!.trim()} — ${new Date().toISOString().slice(0, 10)}`);
  }, [open, initialSegment]);

  const create = useMutation(async () => {
    const created = await api.post<{ campaign: Campaign }>("/api/campaigns", {
      name,
      segment,
      templateKey,
      messageBody: body,
      offerLabel: offer || undefined
    });
    const result = await api.post<{ queued: number; message: string }>(`/api/campaigns/${created.campaign.id}/send`);
    return { campaign: created.campaign, ...result };
  });

  if (!can("campaigns")) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Win-back campaigns are on Growth"
        size="sm"
        footer={
          <>
            <Button onClick={onClose} variant="ghost">
              Not now
            </Button>
            <Button onClick={() => navigate("/app/settings?tab=plan")} variant="primary">
              See plans
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-ink-600">
          Your {data.plan.name} plan sends automatic return reminders, but bulk win-back campaigns with revenue
          attribution start on Growth. Everything else on this screen keeps working.
        </p>
      </Modal>
    );
  }

  const preview = audience.data;
  const overAllowance = preview ? !preview.withinAllowance : false;

  const send = async () => {
    const result = await create.run();
    if (!result) return;
    toast.success(result.message);
    onSent?.();
    onClose();
    navigate(`/app/campaigns/${result.campaign.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === "compose" ? "New win-back campaign" : "Confirm this send"}
      description={
        step === "compose"
          ? "Sent from your own WhatsApp Business number."
          : "Once queued, these messages start going out within five minutes."
      }
      size="lg"
      footer={
        step === "compose" ? (
          <>
            <Button onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={() => setStep("confirm")}
              variant="primary"
              disabled={!name.trim() || !body.trim() || !preview || preview.count === 0}
            >
              Review {preview ? pluralize(preview.count, "recipient") : "audience"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep("compose")} variant="ghost">
              Back
            </Button>
            <Button onClick={send} variant="primary" busy={create.busy} disabled={overAllowance}>
              Send to {preview ? formatNumber(preview.count) : "…"}
            </Button>
          </>
        )
      }
    >
      {create.error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
          {create.error}
        </p>
      ) : null}

      {step === "compose" ? (
        <div className="space-y-5">
          <Select
            label="Who should this go to?"
            value={segment}
            onChange={(value) => setSegment(value as Segment)}
            options={SEGMENTS.map((entry) => ({ value: entry.value, label: entry.label }))}
            error={create.fields.segment}
          />

          <AudienceSummary loading={audience.loading} preview={preview} error={audience.error} />

          <TextInput
            label="Campaign name"
            hint="For your own records — customers never see this."
            value={name}
            onChange={setName}
            error={create.fields.name}
            required
          />

          <Select
            label="Approved template"
            hint="WhatsApp requires business-initiated messages to use a template Meta has approved."
            value={templateKey}
            onChange={setTemplateKey}
            options={marketingTemplates.map((template) => ({ value: template.key, label: template.label }))}
            error={create.fields.templateKey}
          />

          <TextInput
            label="The offer"
            hint="Fills the offer placeholder in the template."
            value={offer}
            onChange={setOffer}
            error={create.fields.offerLabel}
          />

          <Textarea
            label="Message"
            hint="{{name}} is replaced with each customer's first name."
            value={body}
            onChange={setBody}
            rows={4}
            maxLength={1000}
            error={create.fields.messageBody}
            required
          />

          <WhatsappBubble
            body={body.replace("{{name}}", preview?.customers[0]?.full_name.split(" ")[0] ?? "Ayesha")}
            from={data.organization.name}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="stat-label">Recipients</dt>
                <dd className="tabular text-xl font-semibold text-ink-900">
                  {preview ? formatNumber(preview.count) : "—"}
                </dd>
              </div>
              <div>
                <dt className="stat-label">Messages left this month</dt>
                <dd className="tabular text-xl font-semibold text-ink-900">
                  {preview ? formatNumber(preview.allowance.remaining) : "—"}
                </dd>
              </div>
              <div>
                <dt className="stat-label">Sent from</dt>
                <dd className="truncate text-sm font-medium text-ink-800">
                  {data.whatsapp.displayPhone ? formatPhone(data.whatsapp.displayPhone) : "Not connected yet"}
                </dd>
              </div>
            </dl>
            {preview ? (
              <div className="mt-4">
                <ProgressBar
                  used={preview.allowance.used + preview.count}
                  total={preview.allowance.total}
                  label="Allowance after this send"
                />
              </div>
            ) : null}
          </div>

          {overAllowance ? (
            <p className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
              This send is larger than the messages left on your {data.plan.name} plan. Narrow the audience or upgrade
              before sending.
            </p>
          ) : data.whatsapp.status === "not_connected" ? (
            <p className="rounded-lg bg-gold-100 px-3.5 py-3 text-sm leading-6 text-gold-700" role="alert">
              Your WhatsApp Business number is not connected yet, so these messages will sit in the queue rather than
              going out today. They send automatically the moment you connect it in Settings.
            </p>
          ) : (
            <p className="text-sm leading-6 text-ink-600">
              Meta charges your WhatsApp Business account for each marketing message. Saloona does not add a markup —
              the cost appears on your own Meta billing.
            </p>
          )}

          <WhatsappBubble
            body={body.replace("{{name}}", preview?.customers[0]?.full_name.split(" ")[0] ?? "Ayesha")}
            from={data.organization.name}
          />

          {preview && preview.customers.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-brand-700">
                Show the first {preview.customers.length} recipients
              </summary>
              <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                {preview.customers.map((customer) => (
                  <li key={customer.id} className="flex justify-between gap-3 text-ink-600">
                    <span className="truncate">{customer.full_name}</span>
                    <span className="tabular shrink-0 text-ink-400">{formatPhone(customer.phone)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function AudienceSummary({
  loading,
  preview,
  error
}: {
  loading: boolean;
  preview: AudiencePreview | null;
  error: string | null;
}) {
  if (error) {
    return <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>;
  }
  if (loading || !preview) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-ink-50 px-3.5 py-2.5 text-sm text-ink-500">
        <Spinner size={14} /> Counting the audience…
      </p>
    );
  }
  if (preview.count === 0) {
    return (
      <p className="rounded-lg bg-gold-100 px-3.5 py-2.5 text-sm text-gold-700">
        Nobody matches this segment right now. Customers must have consented to WhatsApp and not opted out.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">
      <strong className="font-semibold">{pluralize(preview.count, "customer")}</strong> match this segment.{" "}
      {formatNumber(preview.allowance.remaining)} messages left in your allowance this month.
    </p>
  );
}

/** A rendered WhatsApp bubble, so the owner sees what the customer will see. */
export function WhatsappBubble({ body, from }: { body: string; from: string }) {
  return (
    <div className="rounded-xl bg-[#e7ded4] p-4">
      <p className="mb-2 text-center text-xs text-ink-500">Preview — sent from {from}</p>
      <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2.5 text-sm leading-6 text-ink-900 shadow-sm">
        <span className="whitespace-pre-wrap">{body || "Your message will appear here."}</span>
        <span className="mt-1 block text-right text-[11px] text-ink-500">now ✓✓</span>
      </div>
    </div>
  );
}
