/**
 * Phone normalisation to E.164.
 *
 * Customer identity in this product is the phone number, and WhatsApp delivery
 * requires E.164. Storing what the receptionist typed ("0300 123 4567",
 * "+92 300-1234567", "923001234567") guarantees duplicate customer records and
 * silent message failures, so everything is normalised at the boundary.
 */

export const DEFAULT_COUNTRY = "PK";

const COUNTRY_CODES: Record<string, { dialCode: string; nationalLength: number }> = {
  // Pakistani mobile numbers are 10 digits after the leading 0 (3XXXXXXXXX).
  PK: { dialCode: "92", nationalLength: 10 }
};

export interface NormalizedPhone {
  e164: string;
  national: string;
}

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneError";
  }
}

/**
 * Returns the E.164 form (e.g. `+923001234567`).
 * Throws `PhoneError` when the input cannot be a valid number for the country.
 */
export function normalizePhone(input: string, country = DEFAULT_COUNTRY): NormalizedPhone {
  const config = COUNTRY_CODES[country];
  if (!config) throw new PhoneError(`Unsupported country: ${country}`);

  const raw = String(input ?? "").trim();
  if (!raw) throw new PhoneError("Phone number is required");

  // Keep digits only; a leading + is handled by the prefix checks below.
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) throw new PhoneError("Phone number must contain digits");

  const { dialCode, nationalLength } = config;

  // 00923001234567 -> 923001234567
  if (digits.startsWith(`00${dialCode}`)) digits = digits.slice(2);
  // 03001234567 -> 3001234567 (drop the national trunk prefix)
  if (digits.length === nationalLength + 1 && digits.startsWith("0")) digits = digits.slice(1);
  // 923001234567 -> 3001234567
  if (digits.startsWith(dialCode) && digits.length === dialCode.length + nationalLength) {
    digits = digits.slice(dialCode.length);
  }

  if (digits.length !== nationalLength) {
    throw new PhoneError(`Enter a valid ${country} mobile number`);
  }
  if (country === "PK" && !digits.startsWith("3")) {
    throw new PhoneError("Enter a valid Pakistani mobile number starting 03…");
  }

  return { e164: `+${dialCode}${digits}`, national: `0${digits}` };
}

/** Non-throwing variant for optional fields. */
export function tryNormalizePhone(input: string | null | undefined, country = DEFAULT_COUNTRY): string | null {
  if (!input) return null;
  try {
    return normalizePhone(input, country).e164;
  } catch {
    return null;
  }
}

/** Display form for UI: +923001234567 -> 0300 1234567 */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^\+92(\d{3})(\d{7})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]} ${match[2]}`;
}
