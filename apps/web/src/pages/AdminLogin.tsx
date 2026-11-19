import { TranslatedText } from "../lib/language";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth, type SessionUser } from "../lib/auth";
import { useRouter } from "../lib/router";
import { workspaceEntryPath } from "../lib/workspaceGate";

/** Hidden admin entry — not linked from public navigation. */
export function AdminLoginPage() {
  const { setSession } = useAuth();
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/v1/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setSession(res.token, res.user);
      navigate(workspaceEntryPath(res.user));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1><TranslatedText text={"Console"} /></h1>
      <p className="muted"><TranslatedText text={"Restricted access."} /></p>
      <form className="card-surface form-stack" onSubmit={submit}>
        <label> <TranslatedText text={"Username (email)"} /> <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label> <TranslatedText text={"Password"} /> <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {err && <p className="error-banner"><TranslatedText text={err} /></p>}
        <button type="submit" disabled={busy}>
          <TranslatedText text={busy ? "Signing in…" : "Sign in"} />
        </button>
      </form>
    </div>
  );
}
