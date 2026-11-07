import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../lib/language";

export const TRADE_WINDOW_MIN_HOURS = 24;
export const TRADE_WINDOW_MAX_DAYS = 90;
export const TRADE_WINDOW_MAX_HOURS = TRADE_WINDOW_MAX_DAYS * 24;

export type TradeWindowPreset = { hours: number; label: string };

type Props = {
  label: string;
  hint: string;
  valueHours: number;
  onChange: (hours: number) => void;
  presets: TradeWindowPreset[];
};

export function formatTradeWindowHours(hours: number, t: (s: string) => string): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? t("1 day") : `${days} ${t("days")}`;
  }
  return hours === 1 ? t("1 hour") : `${hours} ${t("hours")}`;
}

export function clampTradeWindowHours(hours: number): number {
  if (!Number.isFinite(hours)) return TRADE_WINDOW_MIN_HOURS;
  return Math.min(TRADE_WINDOW_MAX_HOURS, Math.max(TRADE_WINDOW_MIN_HOURS, Math.round(hours)));
}

function clampDays(days: number): number {
  return Math.min(TRADE_WINDOW_MAX_DAYS, Math.max(1, Math.floor(days)));
}

function hoursToDays(hours: number): number {
  return clampDays(Math.max(1, Math.round(hours / 24)));
}

export function TradeWindowPicker({ label, hint, valueHours, onChange, presets }: Props) {
  const { t } = useLanguage();
  const inputId = useId();
  const lastEmittedHours = useRef(valueHours);
  const [daysInput, setDaysInput] = useState(() => String(hoursToDays(valueHours)));

  useEffect(() => {
    if (valueHours === lastEmittedHours.current) return;
    lastEmittedHours.current = valueHours;
    setDaysInput(String(hoursToDays(valueHours)));
  }, [valueHours]);

  function emitDays(days: number) {
    const clamped = clampDays(days);
    const hours = clamped * 24;
    lastEmittedHours.current = hours;
    setDaysInput(String(clamped));
    onChange(hours);
  }

  function selectPreset(hours: number) {
    emitDays(hours / 24);
  }

  function onDaysInputChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    setDaysInput(digits);
    if (!digits) return;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return;
    if (parsed >= 1 && parsed <= TRADE_WINDOW_MAX_DAYS) {
      const hours = clampDays(parsed) * 24;
      lastEmittedHours.current = hours;
      onChange(hours);
    }
  }

  function onDaysInputBlur() {
    if (!daysInput.trim()) {
      emitDays(hoursToDays(valueHours));
      return;
    }
    const parsed = Number(daysInput);
    if (!Number.isFinite(parsed) || parsed < 1) {
      emitDays(hoursToDays(valueHours));
      return;
    }
    emitDays(parsed);
  }

  const activePresetHours = presets.find((p) => p.hours === valueHours)?.hours ?? null;
  const previewHours = clampTradeWindowHours(valueHours);

  return (
    <div className="trade-window-card">
      <p className="trade-window-label">{label}</p>

      <div className="trade-window-chips" role="group" aria-label={label}>
        {presets.map((p) => (
          <button
            key={p.hours}
            type="button"
            className={`trade-window-chip${activePresetHours === p.hours ? " is-active" : ""}`}
            onClick={() => selectPreset(p.hours)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="trade-window-days-block">
        <label className="trade-window-custom-label" htmlFor={inputId}>
          {t("Or enter number of days")}
        </label>
        <div className="trade-window-stepper">
          <button
            type="button"
            className="trade-window-step-btn"
            aria-label={t("Decrease days")}
            onClick={() => emitDays(hoursToDays(valueHours) - 1)}
          >
            −
          </button>
          <input
            id={inputId}
            className="trade-window-days-input"
            type="number"
            min={1}
            max={TRADE_WINDOW_MAX_DAYS}
            step={1}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby={`${inputId}-hint`}
            value={daysInput}
            onChange={(e) => onDaysInputChange(e.target.value)}
            onBlur={onDaysInputBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onDaysInputBlur();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <button
            type="button"
            className="trade-window-step-btn"
            aria-label={t("Increase days")}
            onClick={() => emitDays(hoursToDays(valueHours) + 1)}
          >
            +
          </button>
        </div>
        <p id={`${inputId}-hint`} className="muted trade-window-custom-cap">
          {t("1–")}{TRADE_WINDOW_MAX_DAYS} {t("days")} · {formatTradeWindowHours(previewHours, t)}
        </p>
      </div>

      <p className="hint trade-window-hint">{hint}</p>
    </div>
  );
}
