import type { SessionUser } from "./auth";
import { workspaceEntryPath } from "./workspaceGate";

/** Trader dashboard vs admin console (includes wallet onboarding when needed). */
export function dashboardPath(user: SessionUser | null | undefined): string {
  return workspaceEntryPath(user);
}
