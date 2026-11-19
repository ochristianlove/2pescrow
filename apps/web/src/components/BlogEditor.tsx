import { useLanguage as useCopyLanguage } from "../lib/language";
import { TranslatedText } from "../lib/language";
import { useEffect, useRef, useState } from "react";
import { toEditorHtml } from "./blogBody";

type Props = {
  html: string;
  busy?: boolean;
  onChange: (html: string) => void;
  onUpload?: (file: File) => Promise<string>;
  tools?: "full" | "terms";
};

export function BlogEditor({ html, busy, onChange, onUpload, tools = "full" }: Props) {
  const { t: localizeCopy } = useCopyLanguage();
  const sheet = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const echoed = useRef<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function markEmpty() {
    const el = sheet.current;
    if (!el) return;
    const text = (el.textContent || "").replace(/\u00a0/g, " ").trim();
    el.classList.toggle("is-empty", text.length === 0);
  }

  useEffect(() => {
    const el = sheet.current;
    if (!el || html === echoed.current) return;
    if (document.activeElement === el) return;
    const next = toEditorHtml(html);
    if (el.innerHTML !== next) el.innerHTML = next;
    echoed.current = el.innerHTML;
    markEmpty();
  }, [html]);

  function remember() {
    const sel = window.getSelection();
    const el = sheet.current;
    if (!sel || !el || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
    saved.current = sel.getRangeAt(0).cloneRange();
  }

  function restore() {
    const el = sheet.current;
    el?.focus();
    const sel = window.getSelection();
    if (!sel || !saved.current) return;
    sel.removeAllRanges();
    sel.addRange(saved.current);
  }

  function publishHtml() {
    const next = sheet.current?.innerHTML || "";
    echoed.current = next;
    markEmpty();
    onChange(next);
  }

  function armParagraphs() {
    document.execCommand("defaultParagraphSeparator", false, "p");
  }

  function run(command: "bold" | "italic") {
    restore();
    document.execCommand(command);
    publishHtml();
  }

  function heading(tag: "h1" | "h2" | "h3") {
    restore();
    const block = () => (document.queryCommandValue("formatBlock") || "").replace(/[<>]/g, "").toLowerCase();
    const next = block() === tag ? "p" : tag;
    document.execCommand("formatBlock", false, next);
    if (block() !== next) document.execCommand("formatBlock", false, `<${next}>`);
    publishHtml();
  }

  function applyLink() {
    const href = linkHref.trim();
    if (!/^https?:\/\//i.test(href)) {
      setNote("A link needs a full address, starting with https://");
      return;
    }
    restore();
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed ? sel.toString() : "";
    if (selected) document.execCommand("createLink", false, href);
    else document.execCommand("insertHTML", false, `<a href="${href}" target="_blank" rel="noreferrer">${href}</a>`);
    setLinkOpen(false);
    setLinkHref("");
    setNote(null);
    publishHtml();
  }

  function insertTable() {
    restore();
    document.execCommand(
      "insertHTML",
      false,
      `<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>`,
    );
    publishHtml();
  }

  async function placeImage(file: File) {
    if (!onUpload) return;
    setNote("Adding image…");
    try {
      const src = await onUpload(file);
      restore();
      document.execCommand("insertHTML", false, `<figure><img src="${src}" alt=""></figure><p><br></p>`);
      setNote(null);
      publishHtml();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The image did not upload.");
    }
  }

  return (
    <div className="desk-editor">
      <div className="desk-toolbar" onMouseDown={remember}>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}><TranslatedText text={"Bold"} /></button>
        {tools === "full" && (
          <button type="button" className="desk-heading desk-heading-1" onMouseDown={(e) => e.preventDefault()} onClick={() => heading("h1")}>H1</button>
        )}
        <button type="button" className="desk-heading desk-heading-2" onMouseDown={(e) => e.preventDefault()} onClick={() => heading("h2")}>H2</button>
        <button type="button" className="desk-heading desk-heading-3" onMouseDown={(e) => e.preventDefault()} onClick={() => heading("h3")}>H3</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")}><TranslatedText text={"Italic"} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { remember(); setLinkOpen((open) => !open); }}><TranslatedText text={"Link"} /></button>
        {tools === "full" && (
          <>
            <button type="button" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}><TranslatedText text={"Image"} /></button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={insertTable}><TranslatedText text={"Table"} /></button>
          </>
        )}
        {note && <span className="desk-note">{note}</span>}
      </div>
      {linkOpen && (
        <div className="desk-linkbar">
          <input
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            placeholder={localizeCopy("https://…")}
            aria-label={localizeCopy("Link address")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
          />
          <button type="button" className="secondary" onClick={applyLink}><TranslatedText text={"Add link"} /></button>
        </div>
      )}
      <div
        ref={sheet}
        className={tools === "terms" ? "desk-sheet desk-sheet-terms" : "desk-sheet"}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={localizeCopy(tools === "terms" ? "Contract terms" : "Post")}
        data-placeholder={tools === "terms" ? "Write the terms both sides are agreeing to. Headings, bold, and links stay with the trade." : "Write the post. Use Image to put a picture where the cursor is."}
        onFocus={armParagraphs}
        onInput={publishHtml}
        onPaste={(e) => {
          const file = Array.from(e.clipboardData.files).find((item) => item.type.startsWith("image/"));
          if (!file) return;
          e.preventDefault();
          remember();
          void placeImage(file);
        }}
        onDrop={(e) => {
          const file = Array.from(e.dataTransfer.files).find((item) => item.type.startsWith("image/"));
          if (!file) return;
          e.preventDefault();
          remember();
          void placeImage(file);
        }}
        onDragOver={(e) => e.preventDefault()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void placeImage(file);
        }}
      />
    </div>
  );
}
