/**
 * WhatsApp delivery via the Meta Cloud API.
 *
 * Each organization connects its **own** WhatsApp Business number and its own
 * Cloud API credentials, so messages arrive from the salon's number and Meta
 * bills the salon, not the platform. That is a product requirement, not an
 * implementation detail: the platform must never carry per-message cost.
 *
 * Consequences that shape this file:
 *   * credentials are per-tenant and encrypted at rest
 *   * an organization with no connected number cannot send, and the queue must
 *     say so plainly rather than silently dropping messages
 *   * outside the 24-hour customer service window Meta only permits approved
 *     template messages, so reminders and win-backs are sent as templates
 */

import type { TenantDb } from "../lib/db.js";
import { openCredentials, sealCredentials } from "../lib/encryption.js";
import { newId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";

const GRAPH_VERSION = "v21.0";

export interface WhatsAppCredentials {
  /** Phone number ID from the WhatsApp Business account, not the phone number. */
  phoneNumberId: string;
  /** WhatsApp Business Account ID, needed to list and create templates. */
  wabaId: string;
  /** Long-lived system user access token. */
  accessToken: string;
  /** The display number, kept only so the UI can show what is connected. */
  displayPhone: string;
}

export interface SendResult {
  ok: boolean;
  externalId?: string;
  /** Stable reason code used to decide whether a retry is worthwhile. */
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
}

/**
 * Meta error codes that will never succeed on retry. Anything else (throttling,
 * transient Graph failures, network errors) is retried with backoff.
 */
const PERMANENT_ERROR_CODES = new Set([
  "131026", // message undeliverable — recipient not on WhatsApp
  "131047", // re-engagement required outside the 24h window without a template
  "131051", // unsupported message type
  "132000", // template parameter count mismatch
  "132001", // template does not exist
  "132005", // template text too long
  "132007", // template format policy violation
  "133010", // phone number not registered
  "190" //     access token expired or invalid
]);

export class WhatsAppNotConnectedError extends Error {
  constructor() {
    super("This workspace has not connected a WhatsApp Business number yet.");
    this.name = "WhatsAppNotConnectedError";
  }
}

export class WhatsAppClient {
  constructor(private readonly credentials: WhatsAppCredentials) {}

  /**
   * Sends an approved template message.
   *
   * Templates are required for business-initiated messages, which is what every
   * reminder and win-back is. Body parameters are positional, matching the
   * `{{1}}`, `{{2}}` placeholders in the approved template.
   */
  async sendTemplate(input: {
    toPhone: string;
    templateName: string;
    languageCode?: string;
    bodyParams?: string[];
    buttonUrlParam?: string;
  }): Promise<SendResult> {
    const components: unknown[] = [];
    if (input.bodyParams && input.bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: input.bodyParams.map((text) => ({ type: "text", text }))
      });
    }
    if (input.buttonUrlParam) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: input.buttonUrlParam }]
      });
    }

    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.toPhone.replace(/^\+/, ""),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode ?? "en" },
        ...(components.length > 0 ? { components } : {})
      }
    });
  }

  /**
   * Sends a free-form text message. Only valid inside the 24-hour window after
   * a customer message, so this is used for replies, never for campaigns.
   */
  async sendText(toPhone: string, body: string): Promise<SendResult> {
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone.replace(/^\+/, ""),
      type: "text",
      text: { preview_url: false, body }
    });
  }

  private async post(payload: unknown): Promise<SendResult> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.credentials.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.credentials.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      const parsed = safeJson(text);

      if (response.ok) {
        const id = parsed?.messages?.[0]?.id as string | undefined;
        return { ok: true, externalId: id, retryable: false };
      }

      const code = String(parsed?.error?.code ?? response.status);
      const message = String(parsed?.error?.message ?? text.slice(0, 300));
      return {
        ok: false,
        errorCode: code,
        errorMessage: message,
        // 429 and 5xx are transient; Meta's own permanent codes are not.
        retryable: !PERMANENT_ERROR_CODES.has(code) && (response.status === 429 || response.status >= 500)
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: "network_error",
        errorMessage: error instanceof Error ? error.message : "Network error",
        retryable: true
      };
    }
  }

  /** Lists the tenant's approved templates so the UI shows only usable ones. */
  async listTemplates(): Promise<Array<{ name: string; status: string; language: string; category: string }>> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.credentials.wabaId}/message_templates?limit=100`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.credentials.accessToken}` }
    });
    if (!response.ok) return [];
    const parsed = safeJson(await response.text());
    const data = (parsed?.data ?? []) as Array<Record<string, string>>;
    return data.map((item) => ({
      name: item.name ?? "",
      status: item.status ?? "UNKNOWN",
      language: item.language ?? "en",
      category: item.category ?? "UTILITY"
    }));
  }

  /** Confirms the stored token still works, for the settings screen. */
  async verify(): Promise<{ ok: boolean; displayPhone?: string; error?: string }> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.credentials.phoneNumberId}?fields=display_phone_number,verified_name`;
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${this.credentials.accessToken}` }
      });
      const parsed = safeJson(await response.text());
      if (!response.ok) {
        return { ok: false, error: String(parsed?.error?.message ?? `HTTP ${response.status}`) };
      }
      return { ok: true, displayPhone: String(parsed?.display_phone_number ?? "") };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Network error" };
    }
  }
}

/** Loads and decrypts the tenant's WhatsApp credentials, if connected. */
export async function loadWhatsAppCredentials(
  db: TenantDb,
  encryptionKey: string | undefined
): Promise<WhatsAppCredentials | null> {
  const row = await db.first<{ config_encrypted: string | null; config_iv: string | null; status: string }>(
    "select config_encrypted, config_iv, status from integrations where provider = 'whatsapp_cloud' {where}"
  );
  if (!row || row.status !== "active") return null;
  return openCredentials<WhatsAppCredentials>(encryptionKey, row.config_encrypted, row.config_iv);
}

/** Stores the tenant's WhatsApp credentials, encrypted. */
export async function saveWhatsAppCredentials(
  db: TenantDb,
  encryptionKey: string | undefined,
  credentials: WhatsAppCredentials
): Promise<void> {
  const sealed = await sealCredentials(encryptionKey, credentials);
  const ts = nowIso();
  const existing = await db.first<{ id: string }>("select id from integrations where provider = 'whatsapp_cloud' {where}");

  if (existing) {
    await db.run(
      `update integrations set config_encrypted = ?, config_iv = ?, status = 'active', display_name = ?,
         connected_at = coalesce(connected_at, ?), last_error = null, updated_at = ? where id = ? {where}`,
      [sealed.ciphertext, sealed.iv, credentials.displayPhone, ts, ts, existing.id]
    );
    return;
  }

  await db.insert("integrations", {
    id: newId("integration"),
    provider: "whatsapp_cloud",
    category: "messaging",
    status: "active",
    display_name: credentials.displayPhone,
    config_encrypted: sealed.ciphertext,
    config_iv: sealed.iv,
    connected_at: ts,
    created_at: ts,
    updated_at: ts
  });
}

export async function disconnectWhatsApp(db: TenantDb): Promise<void> {
  await db.run(
    `update integrations set status = 'inactive', config_encrypted = null, config_iv = null, updated_at = ?
     where provider = 'whatsapp_cloud' {where}`,
    [nowIso()]
  );
}

function safeJson(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return null;
  }
}
