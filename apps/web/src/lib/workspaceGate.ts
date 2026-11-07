import type { SessionUser } from "./auth";

export function userHasLinkedWallet(user: SessionUser | null | undefined): boolean {
  return (user?.wallets?.length ?? 0) > 0;
}

export function isStaffUser(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "moderator") return true;
  return user.role === "agent" && !!user.permissions?.includes("disputes");
}

/** Where to send a signed-in user to enter the workspace (dashboard / admin). */
export function workspaceEntryPath(user: SessionUser | null | undefined): string {
  if (!user) return "/signin";
  if (isStaffUser(user)) return "/admin";
  return "/app";
}

export function connectWalletPath(returnTo?: string): string {
  if (!returnTo || returnTo.startsWith("/signin") || returnTo.startsWith("/connect-wallet")) {
    return "/connect-wallet";
  }
  return `/connect-wallet?returnTo=${encodeURIComponent(returnTo)}`;
}
