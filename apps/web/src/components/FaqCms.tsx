import { TranslatedText } from "../lib/language";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type FaqEntry = {
  id: string;
  question: string;
  answer: string;
  published: boolean;
  sortOrder: number;
};

const empty = { question: "", answer: "", published: false };

export function FaqCms() {
  const { authHeaders } = useAuth();
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setEntries(await api<FaqEntry[]>("/v1/admin/faq", { headers: authHeaders() }));
  }, [authHeaders]);

  useEffect(() => {
    load().catch((error) => setErr(error instanceof Error ? error.message : String(error)));
  }, [load]);

  function openEditor(entry?: FaqEntry) {
    setErr(null);
    setMsg(null);
    if (entry) {
      setEditing(entry.id);
      setForm({ question: entry.question, answer: entry.answer, published: entry.published });
    } else {
      setEditing(null);
      setForm(empty);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (editing) {
        await api(`/v1/admin/faq/${editing}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(form),
        });
        setMsg(form.published ? "FAQ updated and published." : "FAQ saved as a draft.");
      } else {
        await api("/v1/admin/faq", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(form),
        });
        setMsg(form.published ? "FAQ published." : "Draft saved. Publish it when you are ready.");
      }
      setForm(empty);
      setEditing(null);
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function setPublished(entry: FaqEntry, published: boolean) {
    setErr(null);
    setMsg(null);
    try {
      await api(`/v1/admin/faq/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ published }),
      });
      setMsg(published ? "Published on the homepage." : "Hidden from the homepage.");
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= entries.length) return;
    const ids = entries.map((entry) => entry.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(next, 0, moved);
    setErr(null);
    setMsg(null);
    try {
      setEntries(await api<FaqEntry[]>("/v1/admin/faq/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ids }),
      }));
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove(entry: FaqEntry) {
    if (!window.confirm(`Delete “${entry.question}”? It will leave the homepage.`)) return;
    setErr(null);
    setMsg(null);
    try {
      await api(`/v1/admin/faq/${entry.id}`, { method: "DELETE", headers: authHeaders() });
      if (editing === entry.id) openEditor();
      setMsg("FAQ deleted.");
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="card-surface">
      <h2><TranslatedText text={"FAQ"} /></h2>
      <p className="muted"> <TranslatedText text={"Published entries appear on the FAQ page, in this order. Drafts stay off the page."} /> </p>
      {err && <p className="error-banner"><TranslatedText text={err} /></p>}
      {msg && <p className="ok-banner">{msg}</p>}
      <ul className="activity-list">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <strong>{entry.question}</strong>
            <span className="muted"> · <TranslatedText text={entry.published ? "Published" : "Draft"} /></span>
            <p className="muted">{entry.answer}</p>
            <div className="blog-cms-actions">
              <button type="button" className="secondary" disabled={index === 0} onClick={() => void move(index, -1)}><TranslatedText text={"Move up"} /></button>
              <button type="button" className="secondary" disabled={index === entries.length - 1} onClick={() => void move(index, 1)}><TranslatedText text={"Move down"} /></button>
              <button type="button" className="secondary" onClick={() => openEditor(entry)}><TranslatedText text={"Edit"} /></button>
              <button type="button" className="secondary" onClick={() => void setPublished(entry, !entry.published)}>
                <TranslatedText text={entry.published ? "Unpublish" : "Publish"} />
              </button>
              <button type="button" className="secondary" onClick={() => void remove(entry)}><TranslatedText text={"Delete"} /></button>
            </div>
          </li>
        ))}
        {entries.length === 0 && <li className="muted"><TranslatedText text={"No FAQ entries yet."} /></li>}
      </ul>
      <form className="form-stack" onSubmit={submit} style={{ marginTop: "1.25rem" }}>
        <h3><TranslatedText text={editing ? "Edit FAQ" : "New FAQ"} /></h3>
        <label> <TranslatedText text={"Question"} /> <input required minLength={3} maxLength={240} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
        </label>
        <label> <TranslatedText text={"Answer"} /> <textarea required minLength={10} maxLength={4000} rows={6} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> <TranslatedText text={"Published on the homepage"} /> </label>
        <div className="blog-cms-actions">
          <button type="submit" disabled={busy}><TranslatedText text={busy ? "Saving…" : editing ? "Save changes" : "Add FAQ"} /></button>
          {editing && <button type="button" className="secondary" onClick={() => openEditor()}><TranslatedText text={"Cancel"} /></button>}
        </div>
      </form>
    </section>
  );
}
