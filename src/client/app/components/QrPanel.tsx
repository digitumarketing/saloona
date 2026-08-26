/**
 * The reception-desk QR panel.
 *
 * The code itself comes from the Worker (`/j/:slug/qr.svg`) rather than being
 * drawn here, so the same image can be printed, emailed to a signwriter, or
 * pasted into a WhatsApp group. This component is just the frame around it plus
 * the three things an owner wants to do with it: print, copy, share.
 */

import { useState } from "react";
import { Button, useToast } from "../../components/ui";

export function QrPanel({ url, salonName }: { url: string; salonName: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const slug = slugFromJoinUrl(url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some in-app browsers; the link is on screen
      // anyway, so this is a nudge rather than an error.
      toast.info("Copy blocked by your browser — the link is shown below.");
    }
  };

  const share = async () => {
    // Web Share is the natural path on a phone, which is where an owner will
    // actually be when they want to send this to a customer.
    const shareData = { title: `${salonName} rewards`, text: `Collect points at ${salonName}`, url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // A cancelled share throws; falling through to copy is the wrong response,
        // so simply do nothing.
        return;
      }
    }
    await copy();
  };

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="mx-auto w-48 rounded-2xl border border-ink-100 bg-white p-3 shadow-[--shadow-card] sm:mx-0">
        {slug ? (
          <img
            src={`/j/${slug}/qr.svg?size=480`}
            alt={`QR code linking to the ${salonName} rewards card`}
            width={480}
            height={480}
            className="block h-auto w-full"
          />
        ) : (
          <div className="flex aspect-square items-center justify-center text-xs text-ink-400">
            QR unavailable
          </div>
        )}
      </div>

      <div>
        <p className="text-sm leading-6 text-ink-600">
          Customers scan this, enter their name and mobile number, and their points card opens on their phone. There is
          no app to install and no password to remember.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {slug ? (
            <a href={`/j/${slug}/poster`} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              Print desk card
            </a>
          ) : null}
          <Button onClick={share} variant="secondary" size="sm">
            Share link
          </Button>
          <Button onClick={copy} variant="ghost" size="sm">
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            Open as a customer
          </a>
        </div>

        <p className="mt-3 break-all rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-500">{url}</p>
      </div>
    </div>
  );
}

/** Extracts the tenant slug from the absolute join URL the API hands us. */
function slugFromJoinUrl(url: string): string | null {
  const match = /\/j\/([^/?#]+)/.exec(url);
  return match ? match[1]! : null;
}
