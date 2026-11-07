import type nodemailer from "nodemailer";
import { prisma } from "./db";
import { config } from "./config";

export type ResolvedSmtp = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
  source: "database" | "environment";
};

let cached: ResolvedSmtp | null | undefined;
let cacheAt = 0;
const CACHE_MS = 30_000;

function fromEnv(): ResolvedSmtp | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || config.adminEmail;
  return {
    host,
    port,
    secure,
    from,
    source: "environment",
    auth: user && pass ? { user, pass } : undefined,
  };
}

function fromRow(row: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
}): ResolvedSmtp | null {
  const host = row.smtpHost?.trim();
  if (!host) return null;
  const port = row.smtpPort ?? 587;
  const secure = row.smtpSecure || port === 465;
  const user = row.smtpUser?.trim();
  const pass = row.smtpPass ?? undefined;
  const from = row.smtpFrom?.trim() || config.adminEmail;
  return {
    host,
    port,
    secure,
    from,
    source: "database",
    auth: user && pass ? { user, pass } : undefined,
  };
}

export async function resolveSmtpConfig(force = false): Promise<ResolvedSmtp | null> {
  if (!force && cached !== undefined && Date.now() - cacheAt < CACHE_MS) {
    return cached;
  }
  const row = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  const db = row ? fromRow(row) : null;
  cached = db ?? fromEnv();
  cacheAt = Date.now();
  return cached;
}

export function invalidateSmtpCache() {
  cached = undefined;
}

export async function createMailTransport(): Promise<nodemailer.Transporter | null> {
  const smtp = await resolveSmtpConfig();
  if (!smtp) return null;
  const nodemailerMod = await import("nodemailer");
  return nodemailerMod.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
    requireTLS: !smtp.secure && smtp.port === 587,
    tls: { minVersion: "TLSv1.2" },
  });
}

export async function isSmtpConfigured(): Promise<boolean> {
  return (await resolveSmtpConfig()) !== null;
}

export function publicSettingsView<T extends Record<string, unknown>>(row: T) {
  const copy = { ...row } as Record<string, unknown>;
  delete copy.smtpHost;
  delete copy.smtpPort;
  delete copy.smtpUser;
  delete copy.smtpPass;
  delete copy.smtpFrom;
  delete copy.smtpSecure;
  copy.emailConfigured = Boolean((row as { smtpHost?: string | null }).smtpHost?.trim());
  return copy;
}

export function adminSettingsView(row: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
  [key: string]: unknown;
}) {
  const { smtpPass, ...rest } = row;
  return {
    ...rest,
    smtpPassConfigured: Boolean(smtpPass && smtpPass.length > 0),
  };
}
