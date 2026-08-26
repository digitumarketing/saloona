/**
 * Dashboard.
 *
 * The at-risk panel is the top of this screen and not a card buried below the
 * numbers, because it is the only part of the product that makes money when the
 * owner looks at it. Everything above the fold answers one question: who has
 * stopped coming, and what is that worth?
 */

import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/hooks";
import { Link, navigate } from "../../lib/router";
import type { AtRiskCustomer } from "../../lib/types";
import {
  formatNumber,
  formatPkr,
  initials,
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
  EmptyState,
  LoadingBlock,
  PageHeader,
  RevenueChart,
  StatCard
} from "../../components/ui";
import { useApp } from "../context";
import { CampaignComposer } from "../components/CampaignComposer";
import { SetupChecklist } from "./Setup";

export function DashboardPage() {
  const { data, refresh } = useApp();
  const [composerOpen, setComposerOpen] = useState(false);

  const atRisk = useAsync(
    (signal) =>
      api.get<{ customers: AtRiskCustomer[]; totalRecoverablePkr: number }>(
        "/api/customers/at-risk",
        { limit: 12 },
        signal
      ),
    []
  );

  const summary = data.summary;
  const setupIncomplete =
    !data.setup.onboardingCompletedAt && !(data.setup.hasServices && data.setup.hasStaff && data.setup.hasCustomers);

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title={greeting(data.user.name)}
        subtitle={
          summary.today.visits > 0
            ? `${pluralize(summary.today.visits, "visit")} today, ${formatPkr(summary.today.revenuePkr)} taken.`
            : "No visits recorded yet today."
        }
        actions={
          <>
            <Link to="/app/checkout" className="btn btn-primary">
              Record a visit
            </Link>
            <Button onClick={() => setComposerOpen(true)} variant="secondary">
              New campaign
            </Button>
          </>
        }
      />

      {setupIncomplete ? (
        <div className="mb-6">
          <SetupChecklist compact />
        </div>
      ) : null}

      {/* The headline panel. */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-ink-100 bg-gradient-to-br from-ink-900 to-ink-800 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Lost customers</p>
              <p className="mt-1.5 text-2xl font-semibold text-white sm:text-3xl">
                {atRisk.data ? pluralize(summary.customers.atRisk + summary.customers.lost, "customer") : "…"} have
                stopped coming
              </p>
              <p className="mt-1 text-sm text-ink-300">
                Worth{" "}
                <strong className="font-semibold text-gold-300">
                  {atRisk.data ? formatPkr(atRisk.data.totalRecoverablePkr) : "—"}
                </strong>{" "}
                based on what they used to spend.
              </p>
            </div>
            <Button onClick={() => setComposerOpen(true)} variant="gold" size="lg">
              Send win-back campaign
            </Button>
          </div>
        </div>

        {atRisk.loading ? (
          <LoadingBlock rows={5} />
        ) : atRisk.error ? (
          <CardBody>
            <p className="text-sm text-red-700">{atRisk.error}</p>
            <Button onClick={atRisk.reload} variant="secondary" size="sm" className="mt-3">
              Try again
            </Button>
          </CardBody>
        ) : !atRisk.data || atRisk.data.customers.length === 0 ? (
          <EmptyState
            title="Nobody is overdue right now"
            body="As soon as a customer passes their usual gap between visits, they appear here with what winning them back is worth."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Last visit</th>
                    <th scope="col">Overdue by</th>
                    <th scope="col" className="text-right">
                      Average spend
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.data.customers.map((customer) => (
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
                              {pluralize(customer.total_visits, "visit")}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-ink-600">{relativeDays(customer.last_visit_at)}</td>
                      <td>
                        <span className={retentionClass(customer.retention_status)}>
                          {formatNumber(customer.days_overdue)} days
                        </span>
                      </td>
                      <td className="tabular text-right font-medium text-ink-800">
                        {formatPkr(customer.recoverable_pkr)}
                      </td>
                      <td className="text-right">
                        <Link to={`/app/customers/${customer.id}`} className="btn btn-ghost btn-sm">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-ink-100 px-5 py-3 text-sm sm:px-6">
              <Link to="/app/customers?segment=at_risk" className="font-medium text-brand-700 hover:underline">
                See every at-risk customer →
              </Link>
            </div>
          </>
        )}
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue this month"
          value={formatPkr(summary.month.revenuePkr)}
          hint={`${pluralize(summary.month.visits, "visit")} recorded`}
        />
        <StatCard
          label="Recovered by Saloona"
          value={formatPkr(summary.month.recoveredPkr)}
          tone="brand"
          hint={
            summary.month.recoveredVisits > 0
              ? `${pluralize(summary.month.recoveredVisits, "visit")} after a campaign`
              : "No campaign conversions yet"
          }
        />
        <StatCard
          label="Repeat rate"
          value={`${summary.retention.repeatRatePercent}%`}
          hint={`Average ticket ${formatPkr(summary.retention.averageTicketPkr)}`}
        />
        <StatCard
          label="New customers"
          value={formatNumber(summary.month.newCustomers)}
          hint={`${formatNumber(summary.customers.total)} on file`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Revenue, last 30 days"
            subtitle="Completed visits only. Voided bills are excluded."
            action={
              <Button onClick={() => navigate("/app/reports")} variant="ghost" size="sm">
                Reports
              </Button>
            }
          />
          <CardBody>
            <RevenueChart points={data.revenueSeries} />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer health" />
            <CardBody className="space-y-3">
              <HealthRow label="Active" count={summary.customers.active} status="active" total={summary.customers.total} />
              <HealthRow label="At risk" count={summary.customers.atRisk} status="at_risk" total={summary.customers.total} />
              <HealthRow label="Lost" count={summary.customers.lost} status="lost" total={summary.customers.total} />
              <p className="pt-1 text-xs leading-5 text-ink-500">
                Status comes from each customer's own median gap between visits, not one shared rule.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Messages" subtitle="On your own WhatsApp number" />
            <CardBody className="space-y-2.5 text-sm">
              {data.whatsapp.status === "not_connected" ? (
                <p className="rounded-lg bg-gold-100 px-3 py-2.5 leading-6 text-gold-700">
                  Not connected yet, so messages are queueing rather than sending.{" "}
                  <Link to="/app/settings?tab=whatsapp" className="font-semibold underline">
                    Connect WhatsApp
                  </Link>
                </p>
              ) : null}
              <Row label="Sent this month" value={formatNumber(data.messageStats.sent)} />
              <Row label="Waiting to send" value={formatNumber(data.messageStats.queued)} />
              <Row
                label="Failed"
                value={formatNumber(data.messageStats.failed)}
                tone={data.messageStats.failed > 0 ? "warn" : undefined}
              />
              <Link to="/app/messages" className="block pt-1 text-sm font-medium text-brand-700 hover:underline">
                Open message log →
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Loyalty" />
            <CardBody className="space-y-2.5 text-sm">
              <Row label="Points outstanding" value={formatNumber(summary.loyalty.pointsOutstanding)} />
              <Row label="Redemptions this month" value={formatNumber(summary.loyalty.redemptionsThisMonth)} />
              <a
                href={data.joinUrl}
                target="_blank"
                rel="noreferrer"
                className="block pt-1 text-sm font-medium text-brand-700 hover:underline"
              >
                Preview your customer wallet →
              </a>
            </CardBody>
          </Card>
        </div>
      </div>

      <CampaignComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialSegment="at_risk"
        onSent={() => {
          atRisk.reload();
          refresh();
        }}
      />
    </div>
  );
}

function HealthRow({
  label,
  count,
  status,
  total
}: {
  label: string;
  count: number;
  status: string;
  total: number;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={retentionClass(status)}>{retentionLabel(status)}</span>
        <span className="tabular font-medium text-ink-800">
          {formatNumber(count)} <span className="font-normal text-ink-400">({percent}%)</span>
        </span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className={`tabular font-semibold ${tone === "warn" ? "text-red-600" : "text-ink-900"}`}>{value}</span>
    </div>
  );
}

/** Time-of-day greeting in the tenant's own working hours, not the server's. */
function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}
