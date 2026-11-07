import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../lib/copyText";
import { useLanguage } from "../lib/language";

type Props = {
  text: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
  disabled?: boolean;
};

export function CopyButton({
  text,
  className = "secondary",
  label,
  copiedLabel,
  disabled,
}: Props) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [animTick, setAnimTick] = useState(0);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    if (!text.trim()) return;
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    setAnimTick((n) => n + 1);
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 2200);
  }, [text]);

  const btnClass = ["copy-action-btn", className, copied ? "copy-action-btn-done" : ""].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={btnClass}
      disabled={disabled}
      onClick={() => void onCopy()}
      aria-live="polite"
      data-copy-anim={animTick}
    >
      {copied ? copiedLabel ?? t("Copied") : label ?? t("Copy code")}
    </button>
  );
}
