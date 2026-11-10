import { config } from "./config";
import { readBrandPng } from "./brand";
import { createMailTransport, resolveSmtpConfig } from "./smtp";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Turn raw message text into HTML, keeping web and app addresses as real links. */
function textToHtml(text: string) {
  return text
    .split(/(https?:\/\/[^\s]+|twopescrow:\/\/[^\s]+)/g)
    .map((part) => {
      if (!/^(https?:\/\/|twopescrow:\/\/)/.test(part)) return escapeHtml(part);
      const href = escapeHtml(part);
      return `<a href="${href}" style="color:#3ecf8e;text-decoration:underline;word-break:break-all">${href}</a>`;
    })
    .join("");
}

export { AGENT_COMMISSION_BPS, REFERRER_COMMISSION_BPS } from "./commissions";

async function sendPlainEmail(opts: {
  to: string;
  subject: string;
  text: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}): Promise<{ sent: true } | { sent: false; reason: string }> {
  const smtp = await resolveSmtpConfig();
  if (!smtp) {
    opts.log.info?.({ to: opts.to }, "Email disabled — SMTP not configured (set in Admin → Email)");
    opts.log.warn?.({ to: opts.to }, "Email disabled — SMTP not configured");
    return { sent: false, reason: "SMTP is not configured" };
  }

  try {
    const tx = await createMailTransport();
    if (!tx) return { sent: false, reason: "SMTP is not configured" };
    const logo = await readBrandPng("logo");
    const mark = logo
      ? `<img src="cid:brand@2pescrow" alt="2Pescrow" height="36" style="height:36px;width:auto;display:block;border:0" />`
      : "";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body bgcolor="#071018" style="margin:0;padding:0;background:#071018;width:100%"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#071018" style="background:#071018;width:100%;margin:0;padding:0"><tr><td bgcolor="#071018" style="background:#071018;padding:32px 20px;font-family:Segoe UI,sans-serif;color:#e8f4f2">${mark}<div style="margin-top:22px;line-height:1.6;white-space:pre-wrap;font-size:15px;color:#e8f4f2">${textToHtml(opts.text)}</div></td></tr></table></body></html>`;
    await tx.sendMail({
      from: smtp.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html,
      attachments: logo
        ? [{ content: logo, cid: "brand@2pescrow", contentType: "image/png", contentDisposition: "inline" as const, filename: false }]
        : [],
    });
    opts.log.info({ to: opts.to, source: smtp.source }, "Email sent");
    return { sent: true };
  } catch (err) {
    opts.log.info({ to: opts.to, err: String(err) }, "Email delivery failed");
    return { sent: false, reason: "Email delivery failed" };
  }
}

export async function sendMagicLinkEmail(opts: {
  to: string;
  magicLink: string;
  appLink: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}): Promise<{ sent: true } | { sent: false; reason: string }> {
  const subject = "Your 2Pescrow sign-in link";
  const text = [
    "Hi,",
    "",
    "Use this one-time link to sign in on the website (valid for 30 minutes):",
    opts.magicLink,
    "",
    "Or open the 2Pescrow app:",
    opts.appLink,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "— 2Pescrow",
  ].join("\n");

  return sendPlainEmail({ to: opts.to, subject, text, log: opts.log });
}

export async function sendAdminEmailMessage(opts: {
  to: string;
  subject: string;
  message: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}) {
  return sendPlainEmail({ to: opts.to, subject: opts.subject, text: opts.message, log: opts.log });
}

export async function sendReferrerPayoutSentEmail(opts: {
  to: string;
  amountAtomic: string;
  payoutAddress: string;
  payoutChain: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}) {
  const amountDisplay = (Number(BigInt(opts.amountAtomic)) / 1_000_000).toFixed(2);
  const chainLabel = opts.payoutChain === "tron" ? "Tron (TRC-20)" : "Ethereum (ERC-20)";
  const subject = "Your 2Pescrow referral payout has been sent";
  const text = [
    "Hi,",
    "",
    `We have sent your referral commission payout of ${amountDisplay} USDT (6-decimal units) to:`,
    `${opts.payoutAddress} on ${chainLabel}.`,
    "",
    "If you do not see the funds, contact support with this message.",
    "",
    "— 2Pescrow",
  ].join("\n");

  const result = await sendPlainEmail({ to: opts.to, subject, text, log: opts.log });
  if (result.sent) return { sent: true, logged: false };
  return { sent: false, logged: true };
}

export async function sendFeedbackToAdminEmail(opts: {
  adminEmail: string;
  fromUserEmail: string | null;
  fromDisplayName: string | null;
  category: string;
  subject?: string;
  message: string;
  pagePath?: string;
  submissionId: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}) {
  const who = opts.fromDisplayName
    ? `${opts.fromDisplayName} <${opts.fromUserEmail || "no email"}>`
    : opts.fromUserEmail || "Unknown user";
  const subjectLine = opts.subject?.trim()
    ? `[2Pescrow feedback] ${opts.subject.trim()}`
    : `[2Pescrow feedback] ${opts.category}`;

  const text = [
    "New user feedback on 2Pescrow",
    "",
    `Submission ID: ${opts.submissionId}`,
    `From: ${who}`,
    `Category: ${opts.category}`,
    opts.pagePath ? `Page: ${opts.pagePath}` : null,
    "",
    opts.subject?.trim() ? `Subject: ${opts.subject.trim()}` : null,
    "",
    opts.message,
    "",
    "Review and manage this in Admin → Feedback.",
    "",
    "— 2Pescrow",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return sendPlainEmail({ to: opts.adminEmail, subject: subjectLine, text, log: opts.log });
}

export async function sendTradeDeadlineReminderEmail(opts: {
  to: string;
  subject: string;
  body: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}) {
  return sendPlainEmail({
    to: opts.to,
    subject: opts.subject.slice(0, 180) || "2Pescrow reminder",
    text: opts.body,
    log: opts.log,
  });
}
