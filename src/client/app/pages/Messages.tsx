/**
 * Message log.
 *
 * Two jobs: prove to the owner that messages really are going out from their own
 * number, and tell them exactly why one did not. Meta's rejection reasons are shown
 * verbatim rather than translated into a friendly euphemism — "template not
 * approved" is actionable, "something went wrong" is not.
 */

import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useMutation } from "../../lib/hooks";
import { Link } from "../../lib/router";
import type { QueuedMessage } from "../../lib/types";
import { formatDateTime, formatNumber, pluralize } from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatCard,
  Tabs
} from "../../components/ui";
import { useApp } from "../context";

interface MessagesPayload {
  messages: QueuedMessage[];
  stats: { queued: number; sent: number; failed: number };
  usage: { used: number; allowance: number };
}

const FILTERS = [
  { value: "all", label: "Everything" },
  { value: "queued", label: "Waiting" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" }
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const STATUS_CLASS: Record<string, string> = {
  queued: "badge-neutral",
  sending: "badge-brand",
  sent: "badge-active",
  delivered: "badge-active",
  read: "badge-active",
  failed: "badge-lost",
  skipped: "badge-neutral"
};

/** Meta's template keys are internal; these are what the owner should read. */
const TEMPLATE_LABELS: Record<string, string> = {
  visit_thank_you: "Thank you after a visit",
  return_reminder: "Time for your next visit",
  win_back: "Win-back offer",
  reward_unlocked: "Reward unlocked",
  birthday_offer: "Birthday offer",
  review_request: "Review request",
  welcome: "Welcome"
};

/**
 * The hand-send list.
 *
 * Starter has no connected WhatsApp number, so nothing drains the queue. Rather
 * than let those messages pile up unsent, the salon sends them itself: one tap
 * opens WhatsApp on the reception phone with the right customer and the message
 * already written, and they press send.
 *
 * `wa.me` is WhatsApp's own click-to-chat link. It opens a chat and pre-fills
 * the box — it cannot send anything on its own, which is exactly why this is
 * safe: a person sends every message from their own number, so there is no
 * automation of WhatsApp and nothing that risks the salon's number.
 */
function HandSendList({ messages, onSent }: { messages: QueuedMessage[]; onSent: () => void }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const markSent = useMutation(async (id: string) => api.post<{ ok: true }>(`/api/settings/messages/${id}/sent`));

  /**
   * wa.me wants digits only in international form — no plus, spaces or dashes.
   * Phones are stored E.164 (+923001234567), so stripping non-digits is enough.
   * The text is encoded exactly once; encoding it twice is the classic way to
   * put literal %20 in a customer's message.
   */
  const whatsappLink = (phone: string, body: string) =>
    `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;

  const copy = async (message: QueuedMessage) => {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 2000);
    } catch {
      // Clipboard access is denied in some browsers and over plain HTTP. The
      // text is on screen and selectable, so this is not worth an error state.
    }
  };

  if (messages.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base">Ready to send — {formatNumber(messages.length)}</h2>
          <p className="mt-1 text-sm text-ink-600">
            Tap a row to open WhatsApp with the message already written. You press send, so it comes from your own
            number.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-ink-50">
        {messages.map((message) => (
          <li key={message.id} className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{message.customer_name ?? "Customer"}</p>
                <p className="text-xs text-ink-500">
                  {TEMPLATE_LABELS[message.template_key] ?? message.template_key}
                </p>
                <p className="mt-2 max-w-xl rounded-xl bg-ink-50/70 p-3 text-sm leading-6 text-ink-700">
                  {message.body}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => copy(message)}>
                  {copiedId === message.id ? "Copied" : "Copy text"}
                </Button>
                {message.to_phone ? (
                  <a
                    href={whatsappLink(message.to_phone, message.body)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Open WhatsApp
                  </a>
                ) : (
                  <span className="badge-neutral">No phone number</span>
                )}
                <Button
                  variant="ghost"
                  disabled={markSent.busy}
                  onClick={async () => {
                    const result = await markSent.run(message.id);
                    if (result) onSent();
                  }}
                >
                  Mark sent
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {markSent.error ? (
        <p className="border-t border-ink-100 px-5 py-3 text-sm text-red-700 sm:px-6">{markSent.error}</p>
      ) : null}

      <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-400 sm:px-6">
        Saloona cannot see whether you pressed send in WhatsApp, so marking a message sent is on your word. Connect a
        WhatsApp Business number on Growth to have these go out on their own, with delivery confirmed.
      </p>
    </Card>
  );
}

export function MessagesPage() {
  const { data } = useApp();
  const [filter, setFilter] = useState<Filter>("all");

  const log = useAsync((signal) => api.get<MessagesPayload>("/api/settings/messages", undefined, signal), []);

  const messages = log.data?.messages ?? [];
  const usage = log.data?.usage;

  const filtered = useMemo(() => {
    if (filter === "all") return messages;
    if (filter === "queued") return messages.filter((message) => message.status === "queued" || message.status === "sending");
    if (filter === "failed") return messages.filter((message) => message.status === "failed");
    return messages.filter((message) => ["sent", "delivered", "read"].includes(message.status));
  }, [messages, filter]);

  const connected = data.whatsapp.status !== "not_connected";

  /** Queued only — `sending` belongs to the API and must not be offered by hand. */
  const waiting = useMemo(() => messages.filter((message) => message.status === "queued"), [messages]);

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title="Messages"
        subtitle="Everything Saloona has sent on your behalf, and everything waiting to go."
        actions={
          <Button onClick={log.reload} variant="secondary">
            Refresh
          </Button>
        }
      />

      {!connected ? (
        <Card className="mb-6">
          <CardBody>
            <p className="text-sm leading-6 text-ink-700">
              <strong className="font-semibold">No WhatsApp number connected.</strong> Nothing is lost — every message
              below is written and waiting, and you can send them yourself from the reception phone in a tap each.
              Connect a WhatsApp Business number to have them go out on their own.
            </p>
            <Link to="/app/settings?tab=whatsapp" className="btn btn-primary btn-sm mt-3">
              Connect WhatsApp
            </Link>
          </CardBody>
        </Card>
      ) : data.whatsapp.status === "error" ? (
        <Card className="mb-6">
          <CardBody>
            <p className="text-sm leading-6 text-red-800">
              <strong className="font-semibold">Meta is rejecting your credentials.</strong> Nothing can send until they
              are fixed. A permanent system-user token is the usual cause — a temporary one expires after 24 hours.
            </p>
            <Link to="/app/settings?tab=whatsapp" className="btn btn-primary btn-sm mt-3">
              Check the connection
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {/* Only when nothing is draining the queue. With a working connection the
          messages send themselves and a hand-send list would invite duplicates. */}
      {!connected || data.whatsapp.status === "error" ? (
        <HandSendList messages={waiting} onSent={log.reload} />
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent this month" value={formatNumber(usage?.used ?? 0)} />
        <StatCard label="Waiting to send" value={formatNumber(log.data?.stats.queued ?? 0)} />
        <StatCard
          label="Failed"
          value={formatNumber(log.data?.stats.failed ?? 0)}
          tone={(log.data?.stats.failed ?? 0) > 0 ? "risk" : undefined}
        />
        <div className="stat-card">
          <p className="stat-label">Monthly allowance</p>
          <div className="mt-2">
            <ProgressBar used={usage?.used ?? 0} total={usage?.allowance ?? 0} />
          </div>
          <p className="stat-hint">
            {formatNumber(Math.max(0, (usage?.allowance ?? 0) - (usage?.used ?? 0)))} left on {data.plan.name}
          </p>
        </div>
      </div>

      <Card>
        <Tabs value={filter} onChange={setFilter} tabs={FILTERS.map((entry) => ({ ...entry }))} />

        {log.loading && messages.length === 0 ? (
          <LoadingBlock rows={8} />
        ) : log.error ? (
          <EmptyState
            title="Could not load the message log"
            body={log.error}
            action={<Button onClick={log.reload}>Try again</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === "all" ? "No messages yet" : `Nothing in “${FILTERS.find((entry) => entry.value === filter)!.label}”`}
            body={
              filter === "all"
                ? "Reminders are queued automatically when a customer is due back. Campaigns appear here the moment you send one."
                : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">To</th>
                    <th scope="col">Message</th>
                    <th scope="col">Status</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((message) => (
                    <tr key={message.id}>
                      <td className="font-medium text-ink-900">{message.customer_name ?? "—"}</td>
                      <td className="max-w-md">
                        <span className="block text-xs font-medium text-ink-500">
                          {TEMPLATE_LABELS[message.template_key] ?? message.template_key}
                        </span>
                        <span className="line-clamp-2 block text-ink-700">{message.body}</span>
                        {message.last_error ? (
                          <span className="mt-1 block text-xs text-red-700">
                            Meta said: {message.last_error}
                            {message.attempts > 1 ? ` (${pluralize(message.attempts, "attempt")})` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={STATUS_CLASS[message.status] ?? "badge-neutral"}>{message.status}</span>
                      </td>
                      <td className="whitespace-nowrap text-ink-600">
                        {formatDateTime(message.sent_at ?? message.scheduled_for)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-400 sm:px-6">
              The last {formatNumber(messages.length)} messages. Older entries stay in your account but are not shown
              here.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
