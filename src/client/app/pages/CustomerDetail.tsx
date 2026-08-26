/**
 * Customer detail.
 *
 * One screen answering the three questions asked at the desk: what have they had
 * done before, what do they usually spend, and are they due back? The cadence
 * figures are shown as plain numbers with the reasoning next to them, because an
 * owner will not trust "at risk" unless they can see it is derived from this
 * person's own history.
 */

import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useMutation } from "../../lib/hooks";
import { Link, navigate } from "../../lib/router";
import type { Customer, Redemption, Reward, Visit, Wallet } from "../../lib/types";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPhone,
  formatPkr,
  paymentLabel,
  pluralize,
  relativeDays,
  retentionClass,
  retentionLabel
} from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  TextInput,
  useToast
} from "../../components/ui";
import { useApp } from "../context";

interface CustomerDetail {
  customer: Customer;
  visits: Visit[];
  redemptions: Redemption[];
  wallet: Wallet;
}

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const toast = useToast();
  const { data } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const detail = useAsync(
    (signal) => api.get<CustomerDetail>(`/api/customers/${customerId}`, undefined, signal),
    [customerId]
  );

  const consent = useMutation(async (optOut: boolean) =>
    api.post<{ ok: true }>(`/api/customers/${customerId}/${optOut ? "opt-out" : "opt-in"}`)
  );

  const archive = useMutation(async () => api.delete<{ ok: true }>(`/api/customers/${customerId}`));

  if (detail.loading && !detail.data) {
    return (
      <Card>
        <LoadingBlock rows={10} />
      </Card>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <Card>
        <ErrorBlock message={detail.error ?? "That customer could not be found."} onRetry={detail.reload} />
      </Card>
    );
  }

  const { customer, visits, redemptions, wallet } = detail.data;
  const optedOut = customer.whatsapp_opt_out_at !== null;

  return (
    <div className="pb-20 lg:pb-0">
      <div className="mb-4">
        <Link to="/app/customers" className="text-sm font-medium text-ink-500 hover:text-ink-800">
          ← All customers
        </Link>
      </div>

      <PageHeader
        title={customer.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={retentionClass(customer.retention_status)}>{retentionLabel(customer.retention_status)}</span>
            <span className="tabular">{formatPhone(customer.phone)}</span>
            {customer.email ? <span>{customer.email}</span> : null}
            <span>Customer since {formatDate(customer.first_visit_at ?? customer.created_at)}</span>
          </span>
        }
        actions={
          <>
            <Button onClick={() => navigate(`/app/checkout?customer=${customer.id}`)} variant="primary">
              Record a visit
            </Button>
            <Button onClick={() => setRedeemOpen(true)} variant="gold" disabled={wallet.points <= 0}>
              Redeem reward
            </Button>
            <Button onClick={() => setEditOpen(true)}>Edit</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lifetime spend"
          value={formatPkr(customer.lifetime_spend_pkr)}
          hint={pluralize(customer.total_visits, "visit")}
        />
        <StatCard
          label="Average ticket"
          value={formatPkr(customer.total_visits > 0 ? customer.lifetime_spend_pkr / customer.total_visits : 0)}
        />
        <StatCard
          label="Visits roughly every"
          value={customer.avg_gap_days ? `${Math.round(customer.avg_gap_days)} days` : "—"}
          hint={
            customer.avg_gap_days
              ? "Median gap across their own visits"
              : "Needs two visits before a pattern exists"
          }
        />
        <StatCard
          label="Due back"
          value={customer.expected_return_at ? relativeDays(customer.expected_return_at) : "—"}
          tone={customer.retention_status === "at_risk" || customer.retention_status === "lost" ? "risk" : undefined}
          hint={customer.expected_return_at ? formatDate(customer.expected_return_at) : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Visit history" subtitle={`${pluralize(visits.length, "visit")} shown, most recent first`} />
          {visits.length === 0 ? (
            <EmptyState
              title="No visits recorded"
              body="Record their first visit and Saloona starts learning when they are due back."
              action={
                <Button onClick={() => navigate(`/app/checkout?customer=${customer.id}`)} variant="primary">
                  Record a visit
                </Button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Services</th>
                    <th scope="col">Paid with</th>
                    <th scope="col" className="text-right">Total</th>
                    <th scope="col" className="text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((visit) => (
                    <tr key={visit.id} className={visit.status === "voided" ? "opacity-50" : undefined}>
                      <td className="whitespace-nowrap text-ink-600">{formatDateTime(visit.visited_at)}</td>
                      <td>
                        {visit.item_summary ?? "—"}
                        {visit.campaign_id ? (
                          <span className="badge-brand ml-2">after a campaign</span>
                        ) : null}
                        {visit.status === "voided" ? <span className="badge-neutral ml-2">voided</span> : null}
                      </td>
                      <td className="text-ink-600">{paymentLabel(visit.payment_method)}</td>
                      <td className="tabular text-right font-medium">{formatPkr(visit.total_pkr)}</td>
                      <td className="tabular text-right text-gold-700">+{formatNumber(visit.points_earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Loyalty" />
            <CardBody className="space-y-4">
              <div>
                <p className="stat-label">Points balance</p>
                <p className="tabular text-3xl font-semibold text-gold-700">{formatNumber(wallet.points)}</p>
              </div>
              {wallet.nextReward ? (
                <div className="rounded-xl bg-gold-100 px-4 py-3 text-sm">
                  <p className="font-semibold text-gold-700">{wallet.nextReward.name}</p>
                  <p className="tabular mt-0.5 text-gold-700">
                    {formatNumber(wallet.nextReward.pointsRemaining)} points to go
                  </p>
                </div>
              ) : wallet.unlocked.length > 0 ? (
                <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                  {pluralize(wallet.unlocked.length, "reward")} unlocked and waiting to be claimed.
                </p>
              ) : (
                <p className="text-sm text-ink-500">
                  No rewards set up yet.{" "}
                  <Link to="/app/catalog" className="font-medium text-brand-700 hover:underline">
                    Add one
                  </Link>
                </p>
              )}

              {redemptions.length > 0 ? (
                <div>
                  <p className="stat-label mb-2">Redeemed before</p>
                  <ul className="space-y-1.5 text-sm">
                    {redemptions.slice(0, 5).map((redemption) => (
                      <li key={redemption.id} className="flex justify-between gap-3">
                        <span className="truncate text-ink-700">{redemption.reward_name}</span>
                        <span className="shrink-0 text-ink-400">{formatDate(redemption.redeemed_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="WhatsApp" subtitle={`From ${data.organization.name}'s own number`} />
            <CardBody className="space-y-3 text-sm">
              <p className={optedOut ? "text-red-700" : "text-ink-600"}>
                {optedOut
                  ? `Opted out on ${formatDate(customer.whatsapp_opt_out_at)}. Saloona will not message them.`
                  : customer.consent_whatsapp
                    ? "Consented to messages. Reminders and campaigns will reach them."
                    : "No consent recorded yet, so automated messages are held back."}
              </p>
              <Button
                onClick={async () => {
                  const result = await consent.run(!optedOut);
                  if (!result) {
                    toast.error(consent.error ?? "Could not update consent");
                    return;
                  }
                  toast.success(optedOut ? "Opted back in" : "Opted out recorded");
                  detail.reload();
                }}
                busy={consent.busy}
                variant={optedOut ? "secondary" : "danger"}
                size="sm"
              >
                {optedOut ? "Record opt-in" : "Record opt-out"}
              </Button>
              <p className="text-xs leading-5 text-ink-500">
                Consent is a legal requirement, not a preference. Record what the customer actually told you.
              </p>
            </CardBody>
          </Card>

          {customer.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{customer.notes}</p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Record management" />
            <CardBody className="space-y-3 text-sm">
              <Button
                onClick={async () => {
                  try {
                    await api.post(`/api/customers/${customerId}/recompute`);
                    toast.success("Cadence recalculated");
                    detail.reload();
                  } catch {
                    toast.error("Could not recalculate");
                  }
                }}
                size="sm"
              >
                Recalculate their pattern
              </Button>
              <Button onClick={() => setArchiveOpen(true)} variant="danger" size="sm">
                Archive customer
              </Button>
              <p className="text-xs leading-5 text-ink-500">
                Archiving hides them from lists and stops all messages. Their visit history stays, because it is part of
                your own revenue record.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <EditCustomerModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
        onSaved={() => {
          setEditOpen(false);
          detail.reload();
        }}
      />

      <RedeemModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        customerId={customer.id}
        points={wallet.points}
        onRedeemed={() => {
          setRedeemOpen(false);
          detail.reload();
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          const result = await archive.run();
          if (!result) {
            toast.error(archive.error ?? "Could not archive");
            return;
          }
          toast.success("Customer archived");
          navigate("/app/customers");
        }}
        title={`Archive ${customer.full_name}?`}
        body="They will disappear from your lists and receive no further messages. Their visits stay in your reports."
        confirmLabel="Archive"
        destructive
        busy={archive.busy}
      />
    </div>
  );
}

function EditCustomerModal({
  open,
  onClose,
  customer,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: customer.full_name,
    email: customer.email ?? "",
    birthday: customer.birthday ?? "",
    notes: customer.notes ?? "",
    consentWhatsapp: customer.consent_whatsapp === 1
  });

  const save = useMutation(async () =>
    api.patch<{ customer: Customer }>(`/api/customers/${customer.id}`, {
      fullName: form.fullName,
      email: form.email || undefined,
      birthday: form.birthday || undefined,
      notes: form.notes || undefined,
      consentWhatsapp: form.consentWhatsapp
    })
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit customer"
      description="The mobile number is the customer's identity and cannot be changed here — add a new record instead."
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const result = await save.run();
              if (!result) return;
              toast.success("Saved");
              onSaved();
            }}
            variant="primary"
            busy={save.busy}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error ? <p className="error-text">{save.error}</p> : null}
        <TextInput
          label="Full name"
          value={form.fullName}
          onChange={(fullName) => setForm({ ...form, fullName })}
          error={save.fields.fullName}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(email) => setForm({ ...form, email })}
            error={save.fields.email}
          />
          <TextInput
            label="Birthday"
            type="date"
            value={form.birthday}
            onChange={(birthday) => setForm({ ...form, birthday })}
            error={save.fields.birthday}
          />
        </div>
        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(notes) => setForm({ ...form, notes })}
          error={save.fields.notes}
        />
        <Checkbox
          label="Consented to WhatsApp messages"
          checked={form.consentWhatsapp}
          onChange={(consentWhatsapp) => setForm({ ...form, consentWhatsapp })}
        />
      </div>
    </Modal>
  );
}

function RedeemModal({
  open,
  onClose,
  customerId,
  points,
  onRedeemed
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  points: number;
  onRedeemed: () => void;
}) {
  const toast = useToast();
  const [rewardId, setRewardId] = useState("");

  const rewards = useAsync(
    (signal) => (open ? api.get<{ rewards: Reward[] }>("/api/catalog/rewards", undefined, signal) : Promise.resolve(null)),
    [open]
  );

  const redeem = useMutation(async () => api.post("/api/loyalty/redeem", { customerId, rewardId }));

  const available = (rewards.data?.rewards ?? []).filter((reward) => reward.points_required <= points);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Redeem a reward"
      description={`${formatNumber(points)} points available`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const result = await redeem.run();
              if (!result) return;
              toast.success("Reward redeemed");
              onRedeemed();
            }}
            variant="gold"
            busy={redeem.busy}
            disabled={!rewardId}
          >
            Redeem
          </Button>
        </>
      }
    >
      {redeem.error ? <p className="error-text mb-3">{redeem.error}</p> : null}
      {rewards.loading ? (
        <LoadingBlock rows={2} />
      ) : available.length === 0 ? (
        <p className="text-sm leading-6 text-ink-600">
          Nothing is within reach at {formatNumber(points)} points yet. Rewards are configured under Services &amp;
          staff.
        </p>
      ) : (
        <Select
          label="Reward"
          value={rewardId}
          onChange={setRewardId}
          options={[
            { value: "", label: "Choose a reward" },
            ...available.map((reward) => ({
              value: reward.id,
              label: `${reward.name} — ${formatNumber(reward.points_required)} points`
            }))
          ]}
        />
      )}
    </Modal>
  );
}
