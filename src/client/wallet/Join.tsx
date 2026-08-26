/**
 * Join screen — the first thing a customer sees after scanning the code.
 *
 * Three fields, one of them optional. Every extra field on this form costs
 * enrolments, and enrolment is the whole point: a salon with no customers on file
 * has nothing for the retention engine to work with. There is no password and no
 * account to remember — the wallet lives on the device that scanned the code.
 *
 * A phone number that already exists is not an error. The server returns that
 * customer's wallet instead, so someone scanning the code a second time lands on
 * their real points balance rather than being told they already exist.
 */

import { useState } from "react";
import { api } from "../lib/api";
import { useAsync, useMutation } from "../lib/hooks";
import { navigate } from "../lib/router";
import { formatNumber, pluralize } from "../lib/format";
import type { JoinPayload } from "../lib/types";
import { Button, Checkbox, Spinner, TextInput } from "../components/ui";
import { Frame, Notice } from "./Frame";

export function JoinScreen({ slug }: { slug: string }) {
  const salon = useAsync((signal) => api.get<JoinPayload>(`/api/j/${encodeURIComponent(slug)}`, undefined, signal), [
    slug
  ]);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [consent, setConsent] = useState(true);

  const join = useMutation(async () => {
    return api.post<{ created: boolean; walletUrl: string }>(`/api/j/${encodeURIComponent(slug)}/join`, {
      fullName: fullName.trim(),
      phone: phone.trim(),
      consentWhatsapp: consent,
      // An empty string is not a date; the field is optional, so omit it.
      birthday: birthday ? birthday : undefined
    });
  });

  if (salon.loading) {
    return (
      <Frame salon={null}>
        <div className="flex justify-center py-16 text-brand-600">
          <Spinner size={28} />
          <span className="sr-only">Loading</span>
        </div>
      </Frame>
    );
  }

  if (salon.error || !salon.data) {
    return (
      <Frame salon={null}>
        <Notice
          title="This code is not working"
          body={
            salon.error ??
            "We could not find the salon behind this code. Ask at reception for a new one, or check your connection."
          }
          action={
            <Button onClick={salon.reload} variant="primary">
              Try again
            </Button>
          }
        />
      </Frame>
    );
  }

  const { salon: profile, rewards, pointsPerHundredPkr } = salon.data;

  const submit = async () => {
    const result = await join.run();
    if (!result) return;
    navigate(result.walletUrl, { replace: true });
  };

  return (
    <Frame salon={profile}>
      <h1 className="text-2xl">Collect points on every visit</h1>
      <p className="mt-2 text-sm leading-6 text-ink-500">
        Earn {pluralize(pointsPerHundredPkr, "point")} for every Rs 100 you spend at {profile.name}. Nothing to
        install — your card stays on this phone.
      </p>

      {rewards.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {rewards.slice(0, 4).map((reward) => (
            <li key={reward.name} className="flex items-baseline gap-3 rounded-xl bg-gold-100/70 px-4 py-3">
              <span className="tabular shrink-0 text-sm font-semibold text-gold-700">
                {formatNumber(reward.points_required)} pts
              </span>
              <span className="min-w-0 text-sm text-ink-700">
                <span className="font-medium text-ink-900">{reward.name}</span>
                {reward.description ? <span className="block text-ink-500">{reward.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-7 space-y-5">
        {join.error ? (
          <p className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
            {join.error}
          </p>
        ) : null}

        <TextInput
          label="Your name"
          value={fullName}
          onChange={setFullName}
          error={join.fields.fullName}
          autoFocus
          required
        />

        <TextInput
          label="Mobile number"
          hint="Used to find your points next time, and to send your rewards."
          value={phone}
          onChange={setPhone}
          type="tel"
          inputMode="tel"
          placeholder="03XX XXXXXXX"
          error={join.fields.phone}
          required
          onEnter={submit}
        />

        <TextInput
          label="Birthday (optional)"
          hint="So the salon can send you something on the day."
          value={birthday}
          onChange={setBirthday}
          type="date"
          error={join.fields.birthday}
        />

        <Checkbox
          label="Send me reminders and offers on WhatsApp"
          description={`From ${profile.name} only. You can stop them any time from your points card.`}
          checked={consent}
          onChange={setConsent}
        />

        <Button
          onClick={submit}
          variant="primary"
          size="lg"
          fullWidth
          busy={join.busy}
          disabled={!fullName.trim() || !phone.trim()}
        >
          Get my points card
        </Button>

        <p className="text-center text-xs leading-5 text-ink-400">
          By joining you agree that {profile.name} may contact you about your visits.{" "}
          <a href="/privacy" className="underline hover:text-ink-600">
            How your data is handled
          </a>
        </p>
      </div>
    </Frame>
  );
}
