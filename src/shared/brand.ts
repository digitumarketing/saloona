/**
 * Brand configuration.
 *
 * Kept in one place so the product name, contact details, and public copy can
 * be changed without touching templates, emails, SEO metadata, or the PWA
 * manifest.
 */

export const brand = {
  productName: "Saloona",
  companyName: "Digitum",
  legalName: "Digitum Technologies",
  country: "Pakistan",
  currency: "PKR",
  locale: "en-PK",
  timezone: "Asia/Karachi",
  supportEmail: "hello@digitum.pk",
  salesPhone: "+92 300 0000000",
  /** Overridden per environment by the BASE_URL variable. */
  baseUrl: "https://saloona.pk",
  tagline: "Bring your customers back. Automatically.",
  description:
    "Saloona is salon software for Pakistan. Track every customer visit, reward repeat clients, and bring lapsed customers back with automatic WhatsApp reminders from your own number.",
  social: {
    twitter: "@digitum",
    linkedin: "https://www.linkedin.com/company/digitum"
  },
  colors: {
    ink: "#14213d",
    teal: "#0f766e",
    gold: "#f59e0b",
    mist: "#f6f8fb",
    paper: "#ffffff"
  }
} as const;

export type Brand = typeof brand;
