/**
 * The points card.
 *
 * This is the screen a customer keeps on their home screen, so the balance is the
 * largest thing on it and the progress to the next reward is directly underneath.
 * Everything else — visit history, redemptions, the messaging toggle — is below
 * the fold, because nobody opens a loyalty card to read an audit log.
 *
 * The wallet token arrives either as a cookie (the normal case) or in the URL (a
 * link sent over WhatsApp). A token that arrived in the URL is stripped from the
 * address bar once the server has exchanged it for a cookie: a customer who
 * screenshots or forwards their wallet page should not be handing over a working
 * key to their own record.
 */

import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useAsync, useMutation } from "../lib/hooks";
import { navigate } from "../lib/router";
import { formatDate, formatNumber, formatPkr, pluralize } from "../lib/format";
import type { WalletPayload } from "../lib/types";
import { Button, Spinner } from "../components/ui";
import { Frame, Notice } from "./Frame";

/**
 * Either the wallet, or the one failure worth a screen of its own. A missing
 * wallet is not an error — it is a customer on a new phone, and the answer is the
 * join form, not a message about tokens.
 */
type Loaded = { ok: true; payload: WalletPayload } | { ok: false };

export function WalletScreen({ slug }: { slug: string }) {
  // Read once. The token is removed from the address bar after a successful load,
  // and the loader must not re-run when that happens.
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token"));

  const state = useAsync<Loaded>(
    async (signal) => {
      try {
        const payload = await api.get<WalletPayload>(
          `/api/j/${encodeURIComponent(slug)}/wallet`,
          token ? { token } : undefined,
          signal
        );
        return { ok: true, payload };
      } catch (cause) {
        if (cause instanceof ApiError && (cause.code === "no_wallet" || cause.code === "invalid_wallet")) {
          return { ok: false };
        }
        throw cause;
      }
    },
    [slug, token]
  );

  const loaded = state.data;

  useEffect(() => {
    if (!token || loaded?.ok !== true) return;
    // Only once the load succeeded: the server sets the cookie on that same
    // response, so until then the token in the URL is the only way back in.
    navigate(window.location.pathname, { replace: true });
  }, [token, loaded]);

  if (state.loading && !loaded) {
    return (
      <Frame salon={null}>
        <div className="flex justify-center py-16 text-brand-600">
          <Spinner size={28} />
          <span className="sr-only">Loading your points</span>
        </div>
      </Frame>
    );
  }

  if (state.error) {
    return (
      <Frame salon={null}>
        <Notice
          title="Could not load your points"
          body={state.error}
          action={
            <Button onClick={state.reload} variant="primary">
              Try again
            </Button>
          }
        />
      </Frame>
    );
  }

  if (!loaded || !loaded.ok) {
    return (
      <Frame salon={null}>
        <Notice
          title="No points card on this phone"
          body="Scan the code at reception with this phone and enter your mobile number — your points are waiting against that number."
          action={
            <Button onClick={() => navigate(`/j/${slug}`)} variant="primary">
              Find my points
            </Button>
          }
        />
      </Frame>
    );
  }

  return <WalletCard payload={loaded.payload} slug={slug} token={token} onChanged={state.reload} />;
}

function WalletCard({
  payload,
  slug,
  token,
  onChanged
}: {
  payload: WalletPayload;
  slug: string;
  token: string | null;
  onChanged: () => void;
}) {
  const { salon, customer, wallet, visits, redemptions } = payload;
  const next = wallet.nextReward;
  const percent = next
    ? Math.min(100, Math.round((wallet.points / Math.max(1, next.pointsRequired)) * 100))
    : wallet.points > 0
      ? 100
      : 0;

  // The token is passed through so the toggle keeps working in the rare case the
  // cookie was blocked but the link still had a token.
  const optOutPath = `/api/j/${encodeURIComponent(slug)}/wallet/opt-out${
    token ? `?token=${encodeURIComponent(token)}` : ""
  }`;

  const setMessaging = useMutation(async (optOut: boolean) => {
    await api.post<{ optedOut: boolean }>(optOutPath, { optOut });
    onChanged();
  });

  return (
    <Frame salon={salon}>
      <p className="text-sm text-ink-500">
        {customer.name} · {customer.phone}
      </p>

      <div className="mt-3 rounded-2xl bg-gradient-to-br from-ink-900 to-brand-800 px-5 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Your points</p>
        <p className="tabular mt-1 text-5xl font-semibold">{formatNumber(wallet.points)}</p>

        {next ? (
          <>
            <p className="mt-4 text-sm text-ink-200">
              <strong className="font-semibold text-gold-300">
                {pluralize(next.pointsRemaining, "point")} to go
              </strong>{" "}
              for {next.name}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-gold-300" style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : wallet.unlocked.length > 0 ? (
          <p className="mt-4 text-sm text-gold-300">
            You have earned every reward on the list. Ask at reception to claim one.
          </p>
        ) : (
          <p className="mt-4 text-sm text-ink-200">Your points appear here after your next visit.</p>
        )}
      </div>

      {wallet.unlocked.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink-900">Ready to claim</h2>
          <ul className="mt-2 space-y-2">
            {wallet.unlocked.map((reward) => (
              <li
                key={reward.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-gold-100 px-4 py-3 text-sm"
              >
                <span className="font-medium text-ink-900">{reward.name}</span>
                <span className="tabular shrink-0 text-gold-700">{formatNumber(reward.pointsRequired)} pts</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-ink-400">
            Show this screen at reception — {salon.name} applies the reward on your bill.
          </p>
        </section>
      ) : null}

      <section className="mt-7">
        <h2 className="text-sm font-semibold text-ink-900">Your visits</h2>
        {visits.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Nothing yet. Your first visit will show up here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-100">
            {visits.map((visit) => (
              <li key={visit.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-ink-800">{formatDate(visit.visitedAt)}</span>
                  {visit.services ? <span className="block truncate text-ink-500">{visit.services}</span> : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block font-medium text-ink-800">{formatPkr(visit.totalPkr)}</span>
                  {visit.pointsEarned > 0 ? (
                    <span className="tabular block text-xs text-brand-700">+{visit.pointsEarned} pts</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {redemptions.length > 0 ? (
        <section className="mt-7">
          <h2 className="text-sm font-semibold text-ink-900">Rewards you have used</h2>
          <ul className="mt-2 divide-y divide-ink-100">
            {redemptions.map((redemption) => (
              <li key={redemption.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-ink-800">{redemption.reward_name}</span>
                  <span className="block text-ink-500">{formatDate(redemption.redeemed_at)}</span>
                </span>
                <span className="tabular shrink-0 text-ink-400">−{formatNumber(redemption.points_spent)} pts</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl bg-ink-50 px-4 py-4">
        <h2 className="text-sm font-semibold text-ink-900">WhatsApp messages</h2>
        {setMessaging.error ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {setMessaging.error}
          </p>
        ) : null}
        <p className="mt-1 text-sm leading-6 text-ink-500">
          {customer.whatsappOptedOut
            ? `${salon.name} is not sending you messages. Turn them back on to hear about your rewards.`
            : `${salon.name} may message you about your visits and rewards. Nobody else can.`}
        </p>
        <Button
          onClick={() => setMessaging.run(!customer.whatsappOptedOut)}
          variant={customer.whatsappOptedOut ? "primary" : "secondary"}
          size="sm"
          busy={setMessaging.busy}
          className="mt-3"
        >
          {customer.whatsappOptedOut ? "Start messages again" : "Stop messages"}
        </Button>
      </section>

      <InstallHint />
    </Frame>
  );
}

/**
 * A one-line nudge to keep the card on the home screen, shown only when the page
 * is running in a browser tab. The wording is deliberately generic: iOS and
 * Android label the control differently, and a hint naming the wrong menu item is
 * worse than no hint.
 */
function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  if (!visible) return null;

  return (
    <p className="mt-6 rounded-xl border border-dashed border-ink-200 px-4 py-3 text-xs leading-5 text-ink-500">
      Keep this handy: use your browser's share or menu button and choose{" "}
      <strong className="font-semibold text-ink-700">Add to Home Screen</strong>. No app to download.
    </p>
  );
}
