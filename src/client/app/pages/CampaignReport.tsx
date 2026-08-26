/**
 * Campaign report.
 *
 * This is the page that has to justify the subscription. Everything on it points
 * at one number: the rupees that came back. Delivery counts are shown, but small,
 * because "47 delivered" is not what an owner is paying for.
 *
 * Attribution is a 30-day window from the message to a visit. That is stated on
 * the page rather than buried in a help article — an owner who does not know how
 * the number is produced will not believe it.
 */

import { api } from "../../lib/api";
import { useAsync } from "../../lib/hooks";
import { Link } from "../../lib/router";
import type { CampaignReport } from "../../lib/types";
import { campaignStatusClass, formatDateTime, formatNumber, formatPkr, segmentLabel } from "../../lib/format";
import { Button, Card, CardBody, CardHeader, ErrorBlock, LoadingBlock, PageHeader, StatCard } from "../../components/ui";
import { useApp } from "../context";
import { WhatsappBubble } from "../components/CampaignComposer";

export function CampaignReportPage({ campaignId }: { campaignId: string }) {
  const { data } = useApp();

  const report = useAsync(
    (signal) => api.get<{ campaign: CampaignReport }>(`/api/campaigns/${campaignId}`, undefined, signal),
    [campaignId]
  );

  if (report.loading && !report.data) {
    return (
      <Card>
        <LoadingBlock rows={8} />
      </Card>
    );
  }

  if (report.error || !report.data) {
    return (
      <Card>
        <ErrorBlock message={report.error ?? "That campaign could not be found."} onRetry={report.reload} />
      </Card>
    );
  }

  const campaign = report.data.campaign;
  const sending = campaign.status === "sending" || campaign.status === "draft";
  const undelivered = Math.max(0, campaign.sent_count - campaign.delivered - campaign.failed);

  return (
    <div className="pb-20 lg:pb-0">
      <div className="mb-4">
        <Link to="/app/campaigns" className="text-sm font-medium text-ink-500 hover:text-ink-800">
          ← All campaigns
        </Link>
      </div>

      <PageHeader
        title={campaign.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={campaignStatusClass(campaign.status)}>{campaign.status}</span>
            <span>{segmentLabel(campaign.segment)}</span>
            {campaign.offer_label ? <span>Offer: {campaign.offer_label}</span> : null}
            <span>Created {formatDateTime(campaign.created_at)}</span>
          </span>
        }
        actions={
          <Button onClick={report.reload} variant="secondary">
            Refresh
          </Button>
        }
      />

      {sending ? (
        <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-800">
          Messages go out in batches every five minutes so your WhatsApp number is never rate-limited. Come back in an
          hour — visits are credited to this campaign for 30 days after each message.
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Messaged" value={formatNumber(campaign.sent_count)} hint={`${formatNumber(campaign.audience_count)} in the audience`} />
        <StatCard
          label="Came back"
          value={formatNumber(campaign.conversions)}
          hint={`${campaign.conversion_rate_percent}% of everyone messaged`}
          tone="brand"
        />
        <StatCard
          label="Revenue recovered"
          value={formatPkr(campaign.revenue_pkr)}
          hint="Their bills within 30 days"
          tone="gold"
        />
        <StatCard
          label="Average recovered bill"
          value={formatPkr(campaign.conversions > 0 ? campaign.revenue_pkr / campaign.conversions : 0)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="What this campaign earned"
              subtitle="Compared with what it cost you to send"
            />
            <CardBody>
              <Verdict campaign={campaign} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery" subtitle="From your own WhatsApp Business number" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="stat-label">Delivered</dt>
                  <dd className="tabular text-2xl font-semibold text-ink-900">{formatNumber(campaign.delivered)}</dd>
                </div>
                <div>
                  <dt className="stat-label">Still queued</dt>
                  <dd className="tabular text-2xl font-semibold text-ink-900">{formatNumber(undelivered)}</dd>
                </div>
                <div>
                  <dt className="stat-label">Failed</dt>
                  <dd className={`tabular text-2xl font-semibold ${campaign.failed > 0 ? "text-red-700" : "text-ink-900"}`}>
                    {formatNumber(campaign.failed)}
                  </dd>
                </div>
              </dl>
              {campaign.failed > 0 ? (
                <p className="mt-4 text-sm leading-6 text-ink-600">
                  Failures are usually a number that is not on WhatsApp, or a template Meta has not approved.{" "}
                  <Link to="/app/messages" className="font-medium text-brand-700 hover:underline">
                    The message log
                  </Link>{" "}
                  shows the reason Meta gave for each one.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="What they received" />
          <CardBody>
            <WhatsappBubble
              body={campaign.message_body.replace("{{name}}", "Ayesha")}
              from={data.organization.name}
            />
            <p className="mt-3 text-xs leading-5 text-ink-500">
              Template: <span className="font-mono">{campaign.template_key}</span>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/**
 * The plain-English verdict.
 *
 * Meta's per-message cost varies by country and category and Saloona does not see
 * the salon's Meta invoice, so this deliberately does not invent a rupee cost. It
 * compares the recovered revenue against the monthly subscription instead, which
 * is the figure the owner is actually deciding about.
 */
function Verdict({ campaign }: { campaign: CampaignReport }) {
  const { data } = useApp();
  const price = data.plan.pricePkr;
  const multiple = price > 0 ? campaign.revenue_pkr / price : 0;

  if (campaign.sent_count === 0) {
    return (
      <p className="text-sm leading-6 text-ink-600">
        Nothing has gone out yet. Once messages are sent, this panel shows what came back.
      </p>
    );
  }

  if (campaign.conversions === 0) {
    return (
      <div className="text-sm leading-6 text-ink-600">
        <p>
          No visits credited to this campaign yet. The window stays open for 30 days after each message, so it is worth
          checking again next week.
        </p>
        <p className="mt-2">
          If a campaign closes with nothing, the usual causes are an offer that was not worth the trip or a segment that
          had already been messaged recently.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-lg leading-8 text-ink-800">
        <strong className="font-semibold text-ink-900">{formatNumber(campaign.conversions)}</strong> of the{" "}
        {formatNumber(campaign.sent_count)} customers you messaged came back and spent{" "}
        <strong className="font-semibold text-gold-700">{formatPkr(campaign.revenue_pkr)}</strong>.
      </p>
      {multiple >= 1 ? (
        <p className="mt-3 rounded-xl bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-800">
          That is {multiple >= 10 ? `${Math.round(multiple)}×` : `${multiple.toFixed(1)}×`} your {data.plan.name} plan's
          monthly price of {formatPkr(price)} — from this one campaign.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-600">
          Your {data.plan.name} plan is {formatPkr(price)} a month. The 30-day window on these messages is still open.
        </p>
      )}
    </div>
  );
}
