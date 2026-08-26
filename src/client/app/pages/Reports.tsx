/**
 * Reports.
 *
 * Split deliberately into two halves. The top is fixed — today and this calendar
 * month — because those are the figures an owner quotes from memory and they must
 * not silently change meaning when a dropdown moves. The bottom half answers "who
 * and what is earning", and only that half responds to the period selector.
 *
 * Everything here is derived from completed visits. Voided bills are excluded by
 * the repository, which is why a mistake corrected at the counter does not inflate
 * a stylist's numbers.
 */

import { api } from "../../lib/api";
import { useAsync, type AsyncState } from "../../lib/hooks";
import { useQueryParam } from "../../lib/router";
import type {
  DashboardSummary,
  RevenuePoint,
  ServicePerformanceRow,
  StaffPerformanceRow
} from "../../lib/types";
import { formatDate, formatNumber, formatPkr, pluralize, retentionClass, retentionLabel } from "../../lib/format";
import {
  BarRow,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  RevenueChart,
  Select,
  StatCard
} from "../../components/ui";
import { useApp } from "../context";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "Last 90 days" },
  { value: "year", label: "Last 12 months" }
] as const;

type Period = (typeof PERIODS)[number]["value"];

/**
 * Byte-order mark for the CSV export. Built from its code point rather than pasted
 * in as a literal, because an invisible character in source is a character nobody
 * reviews and every editor eventually eats.
 */
const CSV_BOM = String.fromCharCode(0xfeff);

export function ReportsPage() {
  const { data, can } = useApp();
  const [periodParam, setPeriodParam] = useQueryParam("period");
  // The period lives in the URL so a report can be bookmarked, or the link sent to
  // whoever does the salon's books.
  const period: Period = PERIODS.some((entry) => entry.value === periodParam) ? (periodParam as Period) : "month";

  const staffAllowed = can("staff_reports");

  const overview = useAsync(
    (signal) =>
      api.get<{ summary: DashboardSummary; revenueSeries: RevenuePoint[] }>(
        "/api/analytics/dashboard",
        undefined,
        signal
      ),
    []
  );

  const services = useAsync(
    (signal) =>
      api.get<{ from: string; services: ServicePerformanceRow[] }>("/api/analytics/services", { period }, signal),
    [period]
  );

  const staff = useAsync(
    async (signal) => {
      // The API answers 402 on Starter. Asking the plan first keeps the upgrade
      // card from arriving as a red error message.
      if (!staffAllowed) return null;
      const payload = await api.get<{ from: string; staff: StaffPerformanceRow[] }>(
        "/api/analytics/staff",
        { period },
        signal
      );
      return payload.staff;
    },
    [period, staffAllowed]
  );

  // The bootstrap payload is used until the fresh call lands, so the page is never
  // blank on arrival.
  const summary = overview.data?.summary ?? data.summary;
  const series = overview.data?.revenueSeries ?? data.revenueSeries;
  const from = services.data?.from;

  const reload = () => {
    overview.reload();
    services.reload();
    staff.reload();
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Reports"
          subtitle={`Times shown in ${data.organization.timezone}. Voided bills are excluded everywhere.`}
          actions={
            <>
              <Button onClick={reload} variant="secondary">
                Refresh
              </Button>
              <Button onClick={() => window.print()} variant="ghost">
                Print
              </Button>
            </>
          }
        />
      </div>

      <div data-print>
        {/* Only appears on paper: a printout with no salon name and no date on it is
            useless a month later. */}
        <div className="mb-5 hidden print:block">
          <h1 className="text-lg font-semibold text-ink-900">{data.organization.name}</h1>
          <p className="text-sm text-ink-500">
            Saloona report · {PERIODS.find((entry) => entry.value === period)!.label}
            {from ? ` from ${formatDate(from)}` : ""}
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Taken today"
            value={formatPkr(summary.today.revenuePkr)}
            hint={`${pluralize(summary.today.visits, "visit")} so far`}
          />
          <StatCard
            label="Revenue this month"
            value={formatPkr(summary.month.revenuePkr)}
            hint={`${pluralize(summary.month.visits, "visit")} recorded`}
          />
          <StatCard
            label="Recovered by Saloona"
            value={formatPkr(summary.month.recoveredPkr)}
            hint={
              summary.month.recoveredVisits > 0
                ? `${pluralize(summary.month.recoveredVisits, "visit")} within 30 days of a campaign`
                : "No campaign conversions this month"
            }
            tone="brand"
          />
          <StatCard
            label="Average ticket"
            value={formatPkr(summary.retention.averageTicketPkr)}
            hint={`Repeat rate ${summary.retention.repeatRatePercent}%`}
          />
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Revenue, last 30 days" subtitle="Completed visits only" />
            <CardBody>
              {overview.loading && !overview.data ? <LoadingBlock rows={4} /> : <RevenueChart points={series} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Retention" subtitle="Where your customer base stands" />
            <CardBody className="space-y-4">
              <div className="space-y-2.5">
                <HealthLine status="active" count={summary.customers.active} total={summary.customers.total} />
                <HealthLine status="at_risk" count={summary.customers.atRisk} total={summary.customers.total} />
                <HealthLine status="lost" count={summary.customers.lost} total={summary.customers.total} />
              </div>
              <dl className="space-y-2 border-t border-ink-100 pt-4 text-sm">
                <Line label="Customers on file" value={formatNumber(summary.customers.total)} />
                <Line label="New this month" value={formatNumber(summary.month.newCustomers)} />
                <Line
                  label="Typical gap between visits"
                  value={
                    summary.retention.averageVisitGapDays === null
                      ? "Not enough history"
                      : pluralize(summary.retention.averageVisitGapDays, "day")
                  }
                />
                <Line label="Points outstanding" value={formatNumber(summary.loyalty.pointsOutstanding)} />
                <Line label="Rewards redeemed this month" value={formatNumber(summary.loyalty.redemptionsThisMonth)} />
              </dl>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Breakdowns"
            subtitle={from ? `Since ${formatDate(from)}` : "Loading period"}
            action={
              <div className="no-print w-44">
                <Select<Period>
                  label="Period"
                  labelHidden
                  value={period}
                  onChange={(next) => setPeriodParam(next)}
                  options={PERIODS.map((entry) => ({ value: entry.value, label: entry.label }))}
                />
              </div>
            }
          />
          <CardBody className="grid gap-8 lg:grid-cols-2">
            <ServiceBreakdown state={services} period={period} />
            <StaffBreakdown state={staff} period={period} allowed={staffAllowed} planName={data.plan.name} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

function ServiceBreakdown({
  state,
  period
}: {
  state: AsyncState<{ from: string; services: ServicePerformanceRow[] }>;
  period: Period;
}) {
  const rows = state.data?.services ?? [];
  const max = Math.max(...rows.map((row) => row.revenue_pkr), 1);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-900">Services by revenue</h3>
        {rows.length > 0 ? (
          <ExportButton
            filename={`saloona-services-${period}.csv`}
            rows={[
              ["Service", "Times sold", "Revenue (PKR)"],
              ...rows.map((row) => [row.service_name, row.bookings, Math.round(row.revenue_pkr)])
            ]}
          />
        ) : null}
      </div>

      {state.loading && !state.data ? (
        <LoadingBlock rows={5} />
      ) : state.error ? (
        <ErrorBlock message={state.error} onRetry={state.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No visits in this period" body="Record a visit at checkout and it appears here." />
      ) : (
        <div className="space-y-3.5">
          {rows.map((row) => (
            <BarRow
              key={row.service_name}
              label={row.service_name}
              value={row.revenue_pkr}
              max={max}
              caption={`${formatPkr(row.revenue_pkr)} · ${formatNumber(row.bookings)}×`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StaffBreakdown({
  state,
  period,
  allowed,
  planName
}: {
  state: AsyncState<StaffPerformanceRow[] | null>;
  period: Period;
  allowed: boolean;
  planName: string;
}) {
  if (!allowed) {
    return (
      <section>
        <h3 className="mb-4 text-sm font-semibold text-ink-900">Team performance</h3>
        <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-5">
          <p className="text-sm font-medium text-ink-800">Included from the Growth plan</p>
          <p className="mt-1.5 text-sm leading-6 text-ink-600">
            Revenue and repeat customers per team member, so commission and rota decisions come from the till rather
            than from memory. Your {planName} plan does not include it yet.
          </p>
          <a href="/pricing" target="_blank" rel="noreferrer" className="btn btn-primary btn-sm no-print mt-4">
            See plans
          </a>
        </div>
      </section>
    );
  }

  const rows = state.data ?? [];

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-900">Team performance</h3>
        {rows.length > 0 ? (
          <ExportButton
            filename={`saloona-team-${period}.csv`}
            rows={[
              ["Team member", "Services done", "Customers", "Revenue (PKR)"],
              ...rows.map((row) => [row.staff_name, row.services, row.customers, Math.round(row.revenue_pkr)])
            ]}
          />
        ) : null}
      </div>

      {state.loading && !state.data ? (
        <LoadingBlock rows={5} />
      ) : state.error ? (
        <ErrorBlock message={state.error} onRetry={state.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing attributed yet"
          body="Pick who performed each service at checkout and this table fills itself in."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Team member</th>
                <th scope="col" className="text-right">
                  Services
                </th>
                <th scope="col" className="text-right">
                  Customers
                </th>
                <th scope="col" className="text-right">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.staff_id}>
                  <td className="font-medium text-ink-900">{row.staff_name}</td>
                  <td className="tabular text-right">{formatNumber(row.services)}</td>
                  <td className="tabular text-right">{formatNumber(row.customers)}</td>
                  <td className="tabular text-right font-semibold text-ink-900">{formatPkr(row.revenue_pkr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function HealthLine({ status, count, total }: { status: string; count: number; total: number }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={retentionClass(status)}>{retentionLabel(status)}</span>
      <span className="tabular font-medium text-ink-800">
        {formatNumber(count)} <span className="font-normal text-ink-400">({percent}%)</span>
      </span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

function ExportButton({ filename, rows }: { filename: string; rows: Array<Array<string | number>> }) {
  return (
    <button
      type="button"
      className="no-print text-xs font-medium text-brand-700 hover:underline"
      onClick={() => downloadCsv(filename, rows)}
    >
      Export CSV
    </button>
  );
}

/**
 * Client-side CSV.
 *
 * The owner's accountant wants this in Excel, and building it in the browser from
 * the rows already on screen means the file cannot disagree with what was
 * displayed. Numbers are left unquoted so Excel treats them as numbers; the
 * leading byte-order mark is what stops Excel on Windows mangling a service name
 * written in Urdu.
 */
function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const body = rows
    .map((row) =>
      row.map((cell) => (typeof cell === "number" ? String(cell) : `"${cell.replace(/"/g, '""')}"`)).join(",")
    )
    .join("\r\n");

  const url = URL.createObjectURL(new Blob([CSV_BOM, body], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
