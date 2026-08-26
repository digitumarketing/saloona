/**
 * Message templates.
 *
 * Business-initiated WhatsApp messages must use a template Meta has approved,
 * so the wording cannot be composed freely at send time. Each entry here mirrors
 * a template the salon submits once during onboarding; `body` is the local
 * preview shown in the dashboard and the fallback used for SMS, while
 * `params` defines the positional variables passed to the Cloud API.
 *
 * Copy is written for Pakistani salon customers: short, warm, English with the
 * option of Roman Urdu, and always naming the salon so the message does not read
 * as spam from an unknown number.
 */

export interface MessageTemplate {
  key: string;
  /** The template name registered with Meta. */
  metaName: string;
  label: string;
  description: string;
  /** Ordered variable names, matching {{1}}, {{2}} … in the approved template. */
  params: string[];
  /** Preview/fallback body with ${variable} placeholders. */
  body: string;
  category: "UTILITY" | "MARKETING";
}

export const MESSAGE_TEMPLATES: readonly MessageTemplate[] = [
  {
    key: "visit_thank_you",
    metaName: "saloona_visit_thank_you",
    label: "Thank you after a visit",
    description: "Sent within an hour of checkout. Confirms points earned and keeps the salon top of mind.",
    params: ["customer_name", "business_name", "points", "total_points"],
    body: "Thank you for visiting, ${customer_name}! You earned ${points} points at ${business_name} today — you now have ${total_points}. See you again soon.",
    category: "UTILITY"
  },
  {
    key: "return_reminder",
    metaName: "saloona_return_reminder",
    label: "Time for your next visit",
    description: "Sent when a customer reaches their usual gap between visits.",
    params: ["customer_name", "business_name", "service_name"],
    body: "Hi ${customer_name}, it has been a while since your last ${service_name} at ${business_name}. Would you like to book your next appointment?",
    category: "MARKETING"
  },
  {
    key: "win_back",
    metaName: "saloona_win_back",
    label: "Win-back offer",
    description: "Sent to at-risk customers as part of a win-back campaign, usually with an offer.",
    params: ["customer_name", "business_name", "offer"],
    body: "We miss you, ${customer_name}! Come back to ${business_name} and enjoy ${offer}. Reply to this message to book.",
    category: "MARKETING"
  },
  {
    key: "reward_unlocked",
    metaName: "saloona_reward_unlocked",
    label: "Reward unlocked",
    description: "Sent when a customer's point balance reaches a reward.",
    params: ["customer_name", "reward_name", "business_name"],
    body: "Good news ${customer_name}! You have unlocked ${reward_name} at ${business_name}. Claim it on your next visit.",
    category: "UTILITY"
  },
  {
    key: "birthday",
    metaName: "saloona_birthday",
    label: "Birthday greeting",
    description: "Sent on the customer's birthday, optionally with a gift.",
    params: ["customer_name", "business_name", "offer"],
    body: "Happy birthday, ${customer_name}! ${business_name} would like to treat you — ${offer} is yours this month.",
    category: "MARKETING"
  },
  {
    key: "review_request",
    metaName: "saloona_review_request",
    label: "Review request",
    description: "Sent a day after a visit, asking for a Google review.",
    params: ["customer_name", "business_name", "review_url"],
    body: "Thanks again for visiting ${business_name}, ${customer_name}. If you enjoyed your visit, a quick review would mean a lot: ${review_url}",
    category: "UTILITY"
  }
];

const TEMPLATE_BY_KEY = new Map(MESSAGE_TEMPLATES.map((template) => [template.key, template]));

export function getTemplate(key: string): MessageTemplate | null {
  return TEMPLATE_BY_KEY.get(key) ?? null;
}

/**
 * Renders a template preview. Missing variables are left visible as `[name]`
 * rather than becoming "undefined" in a message a customer would actually read.
 */
export function renderTemplate(template: MessageTemplate, values: Record<string, string | number>): string {
  return template.body.replace(/\$\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    return value === undefined || value === null || value === "" ? `[${name}]` : String(value);
  });
}

/** Builds the positional parameter array the Cloud API expects. */
export function templateParams(template: MessageTemplate, values: Record<string, string | number>): string[] {
  return template.params.map((name) => {
    const value = values[name];
    return value === undefined || value === null ? "" : String(value);
  });
}
