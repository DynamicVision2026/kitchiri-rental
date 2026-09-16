/**
 * Post-purchase email — the ONLY channel that reaches the report for most buyers.
 *
 * Shopify Checkout, used headless via a cart permalink with no app installed, sends
 * the customer to Shopify's own thank-you page on checkout. There is no reliable
 * redirect back to this site from there, so the unguessable report URL travels by
 * email — see lib/server/shopify.ts and the V15 ticket: "sends a secure, unguessable
 * UUID report URL via email. The unguessable ID IS the credential."
 *
 * NOT EXERCISED AGAINST A LIVE RESEND ACCOUNT. Building and sending the email is real
 * code; actually delivering one requires RESEND_API_KEY and a verified sending
 * domain, neither of which exists in this session. Gated so a missing key logs a
 * clear warning and returns { sent: false } rather than throwing — a webhook must
 * still record the payment and return 200 to Shopify even if email is unreachable;
 * losing the payment record over a missing mail key would be strictly worse than
 * sending no email.
 */

import { Resend } from "resend";

export interface SendReportEmailInput {
  to: string;
  auditId: string;
  amountJpy: number;
}

export type SendReportEmailResult = { sent: true; id: string } | { sent: false; reason: string };

function reportUrl(auditId: string): string {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) return `/taikyo/r/${auditId}`; // relative fallback, only used in the warning log below
  return new URL(`/taikyo/r/${auditId}`, base).toString();
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function buildEmail(input: SendReportEmailInput): { subject: string; html: string; text: string } {
  const url = reportUrl(input.auditId);
  const subject = "退去費用チェック — 診断結果のご案内";
  const text = [
    "お申し込みいただきありがとうございます。",
    "",
    `お支払い金額：${yen(input.amountJpy)}（税込）`,
    "",
    "診断結果はこちらからご覧いただけます（このリンクをお持ちの方のみアクセスできます。第三者に共有しないようご注意ください）：",
    url,
    "",
    "このリンクは発行から90日間有効です。",
    "",
    "本診断は暫定的な参考情報であり、法的助言ではありません。",
  ].join("\n");
  const html = `
    <p>お申し込みいただきありがとうございます。</p>
    <p>お支払い金額：<strong>${yen(input.amountJpy)}</strong>（税込）</p>
    <p>診断結果はこちらからご覧いただけます（このリンクをお持ちの方のみアクセスできます。第三者に共有しないようご注意ください）：</p>
    <p><a href="${url}">${url}</a></p>
    <p>このリンクは発行から90日間有効です。</p>
    <p style="color:#6b6b6b;font-size:.85em">本診断は暫定的な参考情報であり、法的助言ではありません。</p>
  `.trim();
  return { subject, html, text };
}

export async function sendReportEmail(input: SendReportEmailInput): Promise<SendReportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn(
      `[mail] RESEND_API_KEY/RESEND_FROM_EMAIL not configured — report email for audit ${input.auditId} was NOT sent. ` +
        `Report URL: ${reportUrl(input.auditId)}`,
    );
    return { sent: false, reason: "not_configured" };
  }

  const { subject, html, text } = buildEmail(input);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from, to: input.to, subject, html, text });
  if (error) {
    console.error(`[mail] send failed for audit ${input.auditId}: ${error.message}`);
    return { sent: false, reason: error.message };
  }
  return { sent: true, id: data?.id ?? "" };
}
