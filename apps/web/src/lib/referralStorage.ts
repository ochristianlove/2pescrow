const KEY = "2pescrow_ref";

export function storeReferralCode(code: string) {
  localStorage.setItem(KEY, code.trim().toLowerCase());
}

export function peekReferralCode(): string | null {
  return localStorage.getItem(KEY);
}

export function consumeReferralCode(): string | null {
  const v = localStorage.getItem(KEY);
  return v;
}

export function clearReferralCode() {
  localStorage.removeItem(KEY);
}
