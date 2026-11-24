let sharedCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume().catch(() => undefined);
  }
  return sharedCtx;
}

/** Plays a crisp, unobtrusive bell chime for real-time trade & wallet events. */
export function playTradeBell(kind: "sent" | "confirmed" | "update" = "update") {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes =
      kind === "confirmed"
        ? [783.99, 1046.5, 1318.51] // G5 -> C6 -> E6 triumphant bell
        : kind === "sent"
          ? [659.25, 987.77] // E5 -> B5 crisp debit/broadcast bell
          : [880, 1174.66]; // A5 -> D6 live update ping

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.085);
      gain.gain.setValueAtTime(0.0001, now + i * 0.085);
      gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.085 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.085 + 0.36);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.085);
      osc.stop(now + i * 0.085 + 0.38);
    });
  } catch {
    // Browser autoplay policy blocked audio before gesture; ignore silently.
  }
}
