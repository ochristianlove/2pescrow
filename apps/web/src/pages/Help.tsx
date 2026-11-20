import { TranslatedText } from "../lib/language";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../lib/language";

export function HelpPage() {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await api<{ message: string }>("/v1/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      setOk(res.message);
      setName("");
      setEmail("");
      setMessage("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <p className="eyebrow">{t("Support")}</p>
      <h1>{t("Help")}</h1>
      <p className="muted">
        {t("Send a message to the 2Pescrow team. No account is required. We reply to the email you enter.")}
      </p>

      {ok && <p className="ok-banner">{ok}</p>}
      {err && <p className="error-banner"><TranslatedText text={err} /></p>}

      <form className="card-surface form-stack" onSubmit={onSubmit}>
        <label>
          {t("Name")}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <label>
          {t("Email")}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            autoComplete="email"
          />
        </label>
        <label>
          {t("Message")}
          <textarea
            required
            rows={8}
            minLength={10}
            maxLength={8000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("How can we help?")}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? t("Sending…") : t("Send message")}
        </button>
      </form>
    </div>
  );
}
