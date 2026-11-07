const STORAGE_KEY = "2pescrow_create_trade_draft";

export type CreateTradeDraftForm = {
  chain: "ethereum" | "tron";
  title: string;
  description: string;
  tokenSymbol: "USDC" | "USDT" | "TRON_USDT";
  amount: string;
  deliveryWindowHours: number;
  reviewWindowHours: number;
};

export type CreateTradeDraft = {
  step: 1 | 2;
  form: CreateTradeDraftForm;
  savedAt: string;
};

const MIN_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 90 * 24;

function clampWindowHours(hours: number, fallback: number): number {
  if (!Number.isFinite(hours)) return fallback;
  return Math.min(MAX_WINDOW_HOURS, Math.max(MIN_WINDOW_HOURS, Math.round(hours)));
}

const DEFAULT_FORM: CreateTradeDraftForm = {
  chain: "ethereum",
  title: "",
  description: "",
  tokenSymbol: "USDT",
  amount: "",
  deliveryWindowHours: 72,
  reviewWindowHours: 336,
};

function normalizeForm(raw: Partial<CreateTradeDraftForm> | undefined, tronEnabled: boolean): CreateTradeDraftForm {
  const chain = raw?.chain === "tron" && tronEnabled ? "tron" : "ethereum";
  const tokenSymbol: CreateTradeDraftForm["tokenSymbol"] = chain === "tron"
    ? "TRON_USDT"
    : raw?.tokenSymbol === "USDC"
      ? "USDC"
      : "USDT";

  return {
    chain,
    title: typeof raw?.title === "string" ? raw.title : "",
    description: typeof raw?.description === "string" ? raw.description : "",
    tokenSymbol,
    amount: typeof raw?.amount === "string" ? raw.amount : "",
    deliveryWindowHours: clampWindowHours(Number(raw?.deliveryWindowHours), 72),
    reviewWindowHours: clampWindowHours(Number(raw?.reviewWindowHours), 336),
  };
}

export function loadCreateTradeDraft(tronEnabled: boolean): CreateTradeDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreateTradeDraft>;
    const step = parsed.step === 2 ? 2 : 1;
    const form = normalizeForm(parsed.form, tronEnabled);
    if (!form.title.trim() && !form.description.trim() && !form.amount && step === 1) {
      return null;
    }
    return { step, form, savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString() };
  } catch {
    return null;
  }
}

export function saveCreateTradeDraft(draft: Omit<CreateTradeDraft, "savedAt">) {
  const form = draft.form;
  if (!form.title.trim() && !form.description.trim() && !form.amount && draft.step === 1) {
    clearCreateTradeDraft();
    return;
  }
  const payload: CreateTradeDraft = { ...draft, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearCreateTradeDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

export function defaultCreateTradeForm(): CreateTradeDraftForm {
  return { ...DEFAULT_FORM };
}
