/**
 * Request validation schemas.
 *
 * Every mutating endpoint validates its body here before it reaches a
 * repository. Previously unvalidated fields went straight into SQL, so a
 * missing required field surfaced as an unhandled 500 from a NOT NULL
 * constraint.
 */

import { z } from "zod";
import { normalizePhone } from "./phone.js";

/** Trimmed, non-empty, length-capped human text. */
const text = (max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/** Normalises to E.164 at the edge so the rest of the app sees one format. */
export const phoneField = z.string().transform((value, ctx) => {
  try {
    return normalizePhone(value).e164;
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid phone number"
    });
    return z.NEVER;
  }
});

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.string().email("Enter a valid email address"));

/**
 * Password policy: length is the dominant factor for offline attack
 * resistance, so a generous minimum is preferred over composition rules.
 */
export const passwordField = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password must be 200 characters or fewer");

/** Money is stored as whole PKR integers; no floats anywhere in the money path. */
export const pkrAmount = z
  .number()
  .int("Amount must be a whole number of rupees")
  .min(0, "Amount cannot be negative")
  .max(100_000_000, "Amount is too large");

export const planIdField = z.enum(["starter", "growth", "scale"]);

export const signupSchema = z.object({
  businessName: text(120, "Business name"),
  ownerName: text(80, "Your name"),
  email: emailField,
  phone: phoneField,
  password: passwordField,
  planId: planIdField.default("starter"),
  city: optionalText(80),
  timezone: z.string().max(64).default("Asia/Karachi")
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required").max(200)
});

export const passwordResetRequestSchema = z.object({ email: emailField });

export const passwordResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordField
});

export const customerCreateSchema = z.object({
  fullName: text(120, "Customer name"),
  phone: phoneField,
  email: emailField.optional(),
  consentWhatsapp: z.boolean().default(false),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  preferredStaffId: z.string().max(40).optional(),
  notes: optionalText(1000)
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const serviceCreateSchema = z.object({
  name: text(120, "Service name"),
  category: optionalText(60),
  durationMinutes: z.number().int().min(5).max(600).default(45),
  pricePkr: pkrAmount
});

export const serviceUpdateSchema = serviceCreateSchema.partial().extend({
  isActive: z.boolean().optional()
});

export const staffCreateSchema = z.object({
  name: text(80, "Staff name"),
  phone: phoneField.optional(),
  role: optionalText(60),
  locationId: z.string().max(40).optional()
});

export const staffUpdateSchema = staffCreateSchema.partial().extend({
  isActive: z.boolean().optional()
});

/**
 * A visit is a bill with line items. The original schema allowed only one
 * service per visit, which cannot represent "Haircut + Beard".
 */
export const visitCreateSchema = z.object({
  customerId: z.string().min(1, "Select a customer").max(40),
  locationId: z.string().max(40).optional(),
  items: z
    .array(
      z.object({
        serviceId: z.string().min(1).max(40),
        staffId: z.string().max(40).optional(),
        quantity: z.number().int().min(1).max(20).default(1),
        unitPricePkr: pkrAmount,
        discountPkr: pkrAmount.default(0)
      })
    )
    .min(1, "Add at least one service"),
  paymentMethod: z.enum(["cash", "raast", "jazzcash", "easypaisa", "card", "unpaid"]).default("cash"),
  paymentReference: optionalText(120),
  visitedAt: z.string().datetime().optional(),
  notes: optionalText(1000)
});

export const rewardCreateSchema = z.object({
  name: text(80, "Reward name"),
  pointsRequired: z.number().int().min(1).max(1_000_000),
  description: optionalText(300)
});

export const redemptionSchema = z.object({
  customerId: z.string().min(1).max(40),
  rewardId: z.string().min(1).max(40)
});

export const loyaltySettingsSchema = z.object({
  pointsPerHundredPkr: z.number().int().min(0).max(1000).default(1),
  reminderEnabled: z.boolean().default(true),
  defaultReturnDays: z.number().int().min(7).max(365).default(30),
  atRiskMultiplier: z.number().min(1).max(5).default(1.5)
});

export const campaignCreateSchema = z.object({
  name: text(120, "Campaign name"),
  segment: z.enum(["at_risk", "lapsed", "birthday_month", "high_value", "never_returned", "all"]),
  templateKey: z.string().min(1).max(60),
  messageBody: text(1000, "Message"),
  offerLabel: optionalText(120)
});

/**
 * WhatsApp Cloud API connection details, entered once per organization.
 * These are the salon's own credentials — the platform never sends on a shared
 * number — so they are validated for shape here and encrypted before storage.
 */
export const whatsappConnectSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{6,25}$/, "Phone number ID is the numeric ID from Meta, not the phone number"),
  wabaId: z.string().trim().regex(/^\d{6,25}$/, "WhatsApp Business Account ID must be numeric"),
  accessToken: z.string().trim().min(40, "That does not look like a Meta access token").max(500),
  displayPhone: phoneField
});

export const organizationUpdateSchema = z.object({
  name: text(120, "Business name").optional(),
  phone: phoneField.optional(),
  timezone: z.string().max(64).optional(),
  logoUrl: z.string().url("Enter a valid URL").max(500).optional()
});

export const locationCreateSchema = z.object({
  name: text(80, "Branch name"),
  city: optionalText(80),
  address: optionalText(200),
  phone: phoneField.optional()
});

/**
 * Customer self-enrolment from the QR code. Deliberately minimal: anything more
 * than a name and number and people abandon the form at the reception desk.
 */
export const customerJoinSchema = z.object({
  fullName: text(120, "Your name"),
  phone: phoneField,
  consentWhatsapp: z.boolean().default(true),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
});

/**
 * The messaging toggle in the customer wallet. Explicit rather than a bare POST,
 * because opting back in has to be possible from the same control.
 */
export const walletOptOutSchema = z.object({
  optOut: z.boolean()
});

/**
 * Parses a request body, returning either typed data or a field-keyed error
 * map suitable for rendering next to form inputs.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ ok: true; data: z.output<T> } | { ok: false; errors: Record<string, string> }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, errors: { _: "Request body must be valid JSON" } };
  }

  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
