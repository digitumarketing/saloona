/**
 * Campaigns.
 *
 * The list exists to answer one question the owner asks every time: did the last
 * one make money? So the columns are recipients, replies-in-the-form-of-visits,
 * and rupees recovered — not opens and clicks, which WhatsApp does not give us and
 * which would not matter if it did.
 */

import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/hooks";
import { Link } from "../../lib/router";
import type { Campaign } from "../../lib/types";
import { campaignStatusClass, formatDate, formatNumber, formatPkr, segmentLabel } from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatCard,
  useToast
} from "../../components/ui";
import { useApp } from "../context";
import { CampaignComposer } from "../components/CampaignComposer";

interface CampaignsPayload {
  campaigns: Campaign[];
  totals: { campaigns: number; messaged: number; recovered: number; revenue_pkr: number };
}

export function CampaignsPage() {
  const { can } = useApp();
  const [composerOpen, setComposerOpen] = useState(false);

  const list = useAsync((signal) => api.get<CampaignsPayload>("/api/campaigns", undefined, signal), []);

  const campaigns = list.data?.campaigns ?? [];
  const totals = list.data?.totals;

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title="Win-back campaigns"
        subtitle="Sent from your own WhatsApp Business number, with the revenue each one brought back."
        actions={
          <Button onClick={() => setComposerOpen(true)} variant="primary">
            New campaign
          </Button>
        }
      />

      {totals ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Campaigns sent" value={formatNumber(totals.campaigns)} />
          <StatCard label="Customers messaged" value={formatNumber(totals.messaged)} />
          <StatCard
            label="Came back"
            value={formatNumber(totals.recovered)}
            hint={
              totals.messaged > 0
                ? `${Math.round((totals.recovered / totals.messaged) * 100)}% of everyone messaged`
                : undefined
            }
            tone="brand"
          />
          <StatCard
            label="Revenue recovered"
            value={formatPkr(totals.revenue_pkr)}
            hint="Visits within 30 days of a campaign message"
            tone="gold"
          />
        </div>
      ) : null}

      <Card>
        {list.loading && campaigns.length === 0 ? (
          <LoadingBlock rows={6} />
        ) : list.error ? (
          <EmptyState
            title="Could not load campaigns"
            body={list.error}
            action={<Button onClick={list.reload}>Try again</Button>}
          />
        ) : campaigns.length === 0 ? (
          <FirstCampaign onStart={() => setComposerOpen(true)} canSend={can("campaigns")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">Status</th>
                  <th scope="col">Sent</th>
                  <th scope="col" className="text-right">Audience</th>
                  <th scope="col" className="text-right">Messaged</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <Link
                        to={`/app/campaigns/${campaign.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {campaign.name}
                      </Link>
                      <span className="block text-xs text-ink-400">
                        {segmentLabel(campaign.segment)}
                        {campaign.offer_label ? ` · ${campaign.offer_label}` : ""}
                      </span>
                    </td>
                    <td>
                      <span className={campaignStatusClass(campaign.status)}>{campaign.status}</span>
                    </td>
                    <td className="text-ink-600">
                      {campaign.completed_at ? formatDate(campaign.completed_at) : formatDate(campaign.created_at)}
                    </td>
                    <td className="tabular text-right">{formatNumber(campaign.audience_count)}</td>
                    <td className="tabular text-right">{formatNumber(campaign.sent_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CampaignComposer open={composerOpen} onClose={() => setComposerOpen(false)} onSent={list.reload} />
    </div>
  );
}

/**
 * The empty state does the selling.
 *
 * An owner who has never run a campaign does not need an empty table; they need to
 * be told what this does in one sentence and given the button.
 */
function FirstCampaign({ onStart, canSend }: { onStart: () => void; canSend: boolean }) {
  const toast = useToast();
  return (
    <CardBody className="py-10 text-center">
      <h2 className="text-xl">Bring back the customers who stopped coming</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-600">
        Saloona already knows who is overdue against their own visit pattern. Pick that list, write one message, and it
        goes out from your own WhatsApp number. Every visit within the next 30 days is credited back to the campaign, so
        you can see exactly what it earned.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button
          onClick={() => {
            if (!canSend) {
              toast.info("Campaigns are included from the Growth plan.");
            }
            onStart();
          }}
          variant="primary"
          size="lg"
        >
          Create your first campaign
        </Button>
      </div>
    </CardBody>
  );
}
