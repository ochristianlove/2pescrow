import { z } from "zod";
import { config } from "./config";
import { sendFeedbackToAdminEmail } from "./email";
import { prisma } from "./db";

export const FEEDBACK_CATEGORIES = [
  "feature_request",
  "ui_ux",
  "recommendation",
  "visibility",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  feature_request: "App / feature request",
  ui_ux: "UI / UX experience",
  recommendation: "Recommendation",
  visibility: "Can't find / can't see something",
  other: "Other",
};

export function feedbackCategoryLabel(category: string) {
  return CATEGORY_LABELS[category as FeedbackCategory] || category;
}

export async function submitFeedback(opts: {
  userId: string;
  email: string | null;
  displayName: string | null;
  category: FeedbackCategory;
  subject?: string;
  message: string;
  pagePath?: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}) {
  const settings = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  if (!settings?.feedbackEnabled) {
    throw new Error("Feedback is disabled");
  }

  const row = await prisma.feedbackSubmission.create({
    data: {
      userId: opts.userId,
      email: opts.email,
      displayName: opts.displayName,
      category: opts.category,
      subject: opts.subject?.trim() || null,
      message: opts.message.trim(),
      pagePath: opts.pagePath?.trim() || null,
    },
  });

  const emailResult = await sendFeedbackToAdminEmail({
    adminEmail: config.adminEmail,
    fromUserEmail: opts.email,
    fromDisplayName: opts.displayName,
    category: feedbackCategoryLabel(opts.category),
    subject: opts.subject,
    message: opts.message.trim(),
    pagePath: opts.pagePath,
    submissionId: row.id,
    log: opts.log,
  });

  if (emailResult.sent) {
    await prisma.feedbackSubmission.update({
      where: { id: row.id },
      data: { emailSent: true },
    });
  }

  return { id: row.id, emailSent: emailResult.sent };
}

export async function submitPublicHelp(opts: {
  name: string;
  email: string;
  message: string;
  log: { info: (obj: object, msg?: string) => void; warn?: (obj: object, msg?: string) => void };
}) {
  const row = await prisma.feedbackSubmission.create({
    data: {
      email: opts.email,
      displayName: opts.name,
      category: "other",
      subject: "Help request",
      message: opts.message,
      pagePath: "/help",
    },
  });

  const emailResult = await sendFeedbackToAdminEmail({
    adminEmail: config.adminEmail,
    fromUserEmail: opts.email,
    fromDisplayName: opts.name,
    category: "Help",
    subject: "Help request",
    message: opts.message,
    pagePath: "/help",
    submissionId: row.id,
    log: opts.log,
  });

  if (emailResult.sent) {
    await prisma.feedbackSubmission.update({
      where: { id: row.id },
      data: { emailSent: true },
    });
  }

  return { id: row.id, emailSent: emailResult.sent };
}
