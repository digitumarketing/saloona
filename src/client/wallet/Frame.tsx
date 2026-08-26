/**
 * Chrome shared by the two customer screens.
 *
 * The salon's name is the brand here, not ours. A customer is keeping a loyalty
 * card for the salon they visit; Saloona appears once, small, at the bottom. That
 * is a deliberate product decision — a wallet that shouts about the software
 * vendor reads as spam and gets closed.
 */

import type { ReactNode } from "react";
import type { PublicSalon } from "../lib/types";

export function Frame({ salon, children }: { salon: PublicSalon | null; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
        {salon?.logoUrl ? (
          <img
            src={salon.logoUrl}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            {(salon?.name ?? "•").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-ink-900">{salon?.name ?? "Rewards"}</span>
          {salon?.city ? <span className="block text-xs text-ink-400">{salon.city}</span> : null}
        </span>
      </header>

      <main id="main" className="flex-1 px-5 py-6">
        {children}
      </main>

      <footer className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center text-xs text-ink-400">
        Rewards by <span className="font-medium text-ink-500">Saloona</span>
      </footer>
    </div>
  );
}

/** Full-screen message used for a bad slug, a dead link, or a network failure. */
export function Notice({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <h1 className="text-xl">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-ink-500">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
