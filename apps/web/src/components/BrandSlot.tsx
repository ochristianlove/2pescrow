import { TranslatedText } from "../lib/language";
import { useRef, useState } from "react";
import { apiUpload } from "../lib/api";
import { useAuth } from "../lib/auth";
import { brandSrc } from "../lib/brand";

type Props = {
  label: string;
  hint: string;
  value: string;
  fallback: string;
  wide?: boolean;
  onChange: (value: string) => void;
};

export function BrandSlot({ label, hint, value, fallback, wide, onChange }: Props) {
  const { authHeaders } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const src = brandSrc(value, fallback);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const saved = await apiUpload<{ url: string }>("/v1/admin/brand/media", data, authHeaders());
      onChange(saved.url);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "The image did not upload.";
      let message = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        /* plain text */
      }
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brand-slot">
      <p className="desk-panel-label">{label}</p>
      <p className="muted">{hint}</p>
      <button type="button" className="desk-drop" onClick={() => inputRef.current?.click()}>
        <img src={src} alt="" className={wide ? "brand-slot-wide" : "brand-slot-mark"} />
      </button>
      <div className="blog-cms-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <TranslatedText text={busy ? "Uploading…" : "Replace"} />
        </button>
        {value.trim() && (
          <button type="button" className="secondary" onClick={() => onChange("")}> <TranslatedText text={"Use the built-in image"} /> </button>
        )}
      </div>
      {err && <p className="error-banner"><TranslatedText text={err} /></p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
