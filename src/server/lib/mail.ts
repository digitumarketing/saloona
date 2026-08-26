/**
 * Transactional email.
 *
 * Verification and password-reset links are useless if they are only logged, so
 * this wraps a real provider (Resend) and degrades to console output in local
 * development where no API key is configured.
 */

import { brand } from "../../shared/brand.js";
import type { Env } from "../types.js";

interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(env: Env, email: Email): Promise<{ sent: boolean; reason?: string }> {
  if (!env.RESEND_API_KEY) {
    console.log("[mail] no RESEND_API_KEY configured; email not sent", {
      to: email.to,
      subject: email.subject
    });
    return { sent: false, reason: "no_provider" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: `${brand.productName} <${brand.supportEmail}>`,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    });

    if (!response.ok) {
      // Never surfaced to the caller: a mail failure must not reveal whether an
      // address is registered, nor block the request that triggered it.
      console.error("[mail] provider rejected send", response.status, await response.text());
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[mail] send threw", error);
    return { sent: false, reason: "network_error" };
  }
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:${brand.colors.mist};font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:${brand.colors.ink}">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:24px">${brand.productName}</div>
    <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #e6eaf0">
      <h1 style="margin:0 0 12px;font-size:20px">${heading}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#6b7280;font-size:12px;margin-top:20px">
      ${brand.productName} by ${brand.companyName}. If you did not expect this email you can safely ignore it.
    </p>
  </div>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:22px 0"><a href="${url}" style="background:${brand.colors.teal};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${label}</a></p>
  <p style="color:#6b7280;font-size:13px;word-break:break-all">Or paste this link into your browser:<br>${url}</p>`;
}

export function verificationEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: `Confirm your ${brand.productName} account`,
    html: layout(
      `Welcome, ${escapeHtml(name)}`,
      `<p style="margin:0;line-height:1.6">Confirm your email address to finish setting up your ${brand.productName} workspace.</p>${button(url, "Confirm email address")}<p style="color:#6b7280;font-size:13px">This link expires in 48 hours.</p>`
    ),
    text: `Welcome to ${brand.productName}. Confirm your email address: ${url}\n\nThis link expires in 48 hours.`
  };
}

export function passwordResetEmail(to: string, url: string): Email {
  return {
    to,
    subject: `Reset your ${brand.productName} password`,
    html: layout(
      "Reset your password",
      `<p style="margin:0;line-height:1.6">Use the link below to choose a new password. It expires in one hour and can be used once.</p>${button(url, "Choose a new password")}<p style="color:#6b7280;font-size:13px">If you did not request this, no action is needed — your password has not changed.</p>`
    ),
    text: `Reset your ${brand.productName} password: ${url}\n\nThis link expires in one hour.`
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
