import { useEffect } from "react";
import { useAuth } from "./auth";
import { useRouter } from "./router";

/**
 * Requires a magic-link session. Wallet linking is optional until an on-chain action.
 * Public routes should not call this.
 */
export function useWorkspaceGuard() {
  const { user, loading } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/signin");
      return;
    }
  }, [loading, user, navigate]);

  const ready = !loading && !!user;
  return { user, loading, ready };
}
