import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePlatformSettings } from "../lib/platformSettings";
import { useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";
import { userDisplayLabel } from "../lib/userDisplay";

const CATEGORY_KEYS = [
  "App / feature request",
  "UI / UX — what I saw or felt",
  "Recommendation / improvement",
  "Something I can't find or see",
  "Other",
] as const;

const CATEGORY_VALUES: Record<(typeof CATEGORY_KEYS)[number], string> = {
  "App / feature request": "feature_request",
  "UI / UX — what I saw or felt": "ui_ux",
  "Recommendation / improvement": "recommendation",
  "Something I can't find or see": "visibility",
  Other: "other",
};

export function FeedbackPage() {
  const { user, loading, authHeaders } = useAuth();
  const { settings } = usePlatformSettings();
  const { path, navigate } = useRouter();
  const { t } = useLanguage();
  const [categoryKey, setCategoryKey] = useState<(typeof CATEGORY_KEYS)[number]>("UI / UX — what I saw or felt");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (loading) return <p className="muted">{t("Loading…")}</p>;

  if (!user) {
    return (
      <div className="page narrow">
        <h1>{t("Feedback")}</h1>
        <p className="muted">{t("Sign in as a buyer or seller to share feedback about the app, trades, or UI.")}</p>
        <button type="button" onClick={() => navigate("/signin")}>
          {t("Sign in")}
        </button>
      </div>
    );
  }

  if (!settings?.feedbackEnabled) {
    return (
      <div className="page narrow">
        <h1>{t("Feedback")}</h1>
        <p className="muted">
          {t("Feedback is turned off right now. Check back later or contact support through your usual channel.")}
        </p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await api<{ message: string }>("/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          category: CATEGORY_VALUES[categoryKey],
          subject: subject.trim() || undefined,
          message,
          pagePath: path,
        }),
      });
      setOk(res.message);
      setSubject("");
      setMessage("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <p className="eyebrow">{t("Help us improve")}</p>
      <h1>{t("Send feedback")}</h1>
      <p className="muted">
        {t(
          "Tell us about features you want, UI/UX issues, things that confused you, or anything you experienced on the site. Your message goes to the platform admin by email and is stored for review."
        )}
      </p>

      {ok && <p className="ok-banner">{ok}</p>}
      {err && <p className="error-banner">{err}</p>}

      <form className="card-surface form-stack" onSubmit={onSubmit}>
        <label>
          {t("Category")}
          <select
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value as (typeof CATEGORY_KEYS)[number])}
          >
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Short subject (optional)")}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder={t("e.g. Trade list is hard to read on mobile")}
          />
        </label>
        <label>
          {t("Your feedback")}
          <textarea
            required
            rows={8}
            minLength={10}
            maxLength={8000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("Describe what you want changed, what happened, or what you recommend…")}
          />
        </label>
        <p className="hint">
          {t("Signed in as")} <strong>{userDisplayLabel(user)}</strong>
          {path !== "/feedback" ? `${t("from page")} ${path}` : ""}
        </p>
        <button type="submit" disabled={busy}>
          {busy ? t("Sending…") : t("Submit feedback")}
        </button>
      </form>
    </div>
  );
}
