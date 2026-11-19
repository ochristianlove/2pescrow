import { useLanguage as useCopyLanguage } from "../lib/language";
import { TranslatedText } from "../lib/language";
import { useRef } from "react";

const TOKENS = [
  { label: "Trade title", token: "{{tradeTitle}}" },
  { label: "Reminder", token: "{{message}}" },
  { label: "Timing", token: "{{phase}}" },
  { label: "Deadline", token: "{{deadline}}" },
];

const SAMPLE: Record<string, string> = {
  "{{tradeTitle}}": "Sample trade",
  "{{message}}": "The delivery window closes tomorrow.",
  "{{phase}}": "Due tomorrow",
  "{{deadline}}": "Tue 27 Oct, 6:00 PM",
};

const DEFAULT_SUBJECT = "2Pescrow reminder · {{tradeTitle}}";
const DEFAULT_BODY = "Hi,\n\n{{message}}\n\nOpen your trade room on 2Pescrow to take the next step.\n\n— 2Pescrow";

function preview(template: string, fallback: string) {
  const source = template.trim() || fallback;
  return source.replace(/\{\{(tradeTitle|message|phase|deadline)\}\}/g, (token) => SAMPLE[token] || token);
}

type Props = {
  enabled: boolean;
  subject: string;
  body: string;
  onEnabled: (value: boolean) => void;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
};

export function ReminderDesk({ enabled, subject, body, onEnabled, onSubject, onBody }: Props) {
  const { t: localizeCopy } = useCopyLanguage();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    const el = bodyRef.current;
    if (!el) {
      onBody(body + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    onBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="reminder-desk">
      <div className="reminder-head">
        <div>
          <h3><TranslatedText text={"Deadline reminders"} /></h3>
          <p> <TranslatedText text={"Two notes go out when this is on: one the day before a deadline, and one the day after it passes. The bell shows the same reminder. Transaction history does not."} /> </p>
        </div>
        <button
          type="button"
          className={enabled ? "switch on" : "switch"}
          aria-pressed={enabled}
          aria-label={localizeCopy(enabled ? "Turn reminders off" : "Turn reminders on")}
          onClick={() => onEnabled(!enabled)}
        >
          <i />
        </button>
      </div>
      <p className="reminder-state"><TranslatedText text={enabled ? "Reminders are on" : "Reminders are off"} /></p>

      <label> <TranslatedText text={"Subject line"} /> <input value={subject} onChange={(e) => onSubject(e.target.value)} placeholder={DEFAULT_SUBJECT} />
      </label>
      <label> <TranslatedText text={"Letter"} /> <textarea
          ref={bodyRef}
          rows={8}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          placeholder={DEFAULT_BODY}
        />
      </label>
      <div className="reminder-tokens">
        {TOKENS.map((item) => (
          <button key={item.token} type="button" className="secondary" onClick={() => insert(item.token)}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="reminder-sample-label"><TranslatedText text={"Sample of the email"} /></p>
      <div className="reminder-sample">
        <p className="reminder-sample-subject">{preview(subject, DEFAULT_SUBJECT)}</p>
        <p>{preview(body, DEFAULT_BODY)}</p>
      </div>
    </div>
  );
}
