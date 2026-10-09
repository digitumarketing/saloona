/**
 * Brand configuration.
 *
 * Kept in one place so the product name, contact details, and public copy can
 * be changed without touching templates, emails, SEO metadata, or the PWA
 * manifest.
 *
 * Everything here is rendered publicly — in the footer, the legal pages, the
 * `from` address on transactional email, and the Organization block in
 * structured data. Nothing in this file may be a placeholder. The previous
 * version carried `+92 300 0000000` and `hello@digitum.pk`, which reached the
 * contact page, the `/contact` meta description Google shows in results, and
 * every signup email's sender address.
 *
 * The rule for this file: if a value is not real and reachable today, delete
 * the field rather than invent one. An absent phone number reads as a
 * deliberate choice; a fake one reads as an abandoned project.
 */

export const brand = {
  productName: "Saloona",
  companyName: "Saloona",
  /**
   * Shown in the footer copyright and in the terms as the party to the
   * agreement. Deliberately not "Saloona Technologies" or similar — see the
   * note in views/legal.tsx: the business is not an incorporated company yet,
   * and the terms must not claim otherwise.
   */
  legalName: "Saloona",
  country: "Pakistan",
  currency: "PKR",
  locale: "en-PK",
  timezone: "Asia/Karachi",
  supportEmail: "contact@saloona.shop",
  /** Overridden per environment by the BASE_URL variable. */
  baseUrl: "https://saloona.shop",
  tagline: "Bring your customers back. Automatically.",
  description:
    "Saloona is salon software for Pakistan. Track every customer visit, reward repeat clients, and bring lapsed customers back with automatic WhatsApp reminders from your own number.",
  colors: {
    ink: "#14213d",
    teal: "#0f766e",
    gold: "#f59e0b",
    mist: "#f6f8fb",
    paper: "#ffffff"
  }
} as const;

export type Brand = typeof brand;
