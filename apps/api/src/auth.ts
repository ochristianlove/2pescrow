import crypto from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db";
import { config } from "./config";
import { secretsMatch } from "./secrets";
import { addressesMatch, type ChainKey } from "./addresses";

export const STAFF_PERMISSIONS = ["disputes", "disputes_release", "blog", "email"] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export type AuthUser = {
  id: string;
  email: string | null;
  role: string;
  displayName: string | null;
  permissions: StaffPermission[];
};

export function normalizePermissions(role: string, permissions: string[] | null | undefined): StaffPermission[] {
  if (role === "admin") return [...STAFF_PERMISSIONS];
  const allowed = new Set<string>(STAFF_PERMISSIONS);
  return (permissions ?? []).filter((item): item is StaffPermission => allowed.has(item));
}

export function sessionView(user: {
  id: string;
  email: string | null;
  role: string;
  displayName: string | null;
  permissions?: string[] | null;
  hideFromPublicLedger?: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    permissions: normalizePermissions(user.role, user.permissions),
    hideFromPublicLedger: Boolean(user.hideFromPublicLedger),
  };
}

type JwtPayload = {
  sub: string;
  email: string | null;
  role: string;
  exp: number;
};

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}

export function signToken(user: { id: string; email: string | null; role: string }, ttlSec = 60 * 60 * 24 * 14) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${body}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
  } catch {
    return false;
  }
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getBearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const token = getBearer(req);
  if (!token) {
    reply.code(401).send({ error: "Sign in required" });
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) {
    reply.code(401).send({ error: "Invalid or expired session" });
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    reply.code(401).send({ error: "User not found" });
    return null;
  }
  return sessionView(user);
}

export async function optionalUser(req: FastifyRequest): Promise<AuthUser | null> {
  const token = getBearer(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  return sessionView(user);
}

export async function requireActor(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const adminKey = req.headers["x-admin-key"];
  if (typeof adminKey === "string" && adminKey && secretsMatch(adminKey, config.adminApiKey)) {
    return {
      id: "api-key",
      email: config.adminEmail,
      role: "admin",
      displayName: "API Key Admin",
      permissions: [...STAFF_PERMISSIONS],
    };
  }
  return requireUser(req, reply);
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const user = await requireActor(req, reply);
  if (!user) return null;
  if (user.role !== "admin") {
    reply.code(403).send({ error: "Only the super admin can do that" });
    return null;
  }
  return user;
}

export async function requirePermission(
  req: FastifyRequest,
  reply: FastifyReply,
  permission: StaffPermission,
): Promise<AuthUser | null> {
  const user = await requireActor(req, reply);
  if (!user) return null;
  if (user.role === "admin" || user.permissions.includes(permission)) return user;
  reply.code(403).send({ error: "You do not have this privilege" });
  return null;
}

export async function ensureAdminUser() {
  const email = config.adminEmail.toLowerCase();
  const passwordHash = hashPassword(config.adminPassword);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        displayName: "Admin",
        role: "admin",
        passwordHash,
      },
    });
    return;
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: { role: "admin", passwordHash },
  });
}

export { canStaffAccessDisputeEscrow as canStaffDisputeEscrow, canStaffExecuteDisputeResolution as canStaffResolveDispute } from "./disputeResolver";

export async function userMayMutateEscrow(
  user: AuthUser,
  escrow: {
    buyerAddress?: string | null;
    sellerAddress?: string | null;
    buyerUserId?: string | null;
    sellerUserId?: string | null;
    chain: string;
  },
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (escrow.buyerUserId === user.id || escrow.sellerUserId === user.id) return true;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
  const chain = escrow.chain as ChainKey;
  for (const w of wallets) {
    if (addressesMatch(chain, w.address, escrow.buyerAddress)) return true;
    if (addressesMatch(chain, w.address, escrow.sellerAddress)) return true;
  }
  return false;
}

export async function upsertUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, role: normalized === config.adminEmail.toLowerCase() ? "admin" : "user" },
    update: {},
  });
}
