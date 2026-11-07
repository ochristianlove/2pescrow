/** True inside the iOS/Android web view, and in phone browsers. Desktop browsers stay false. */
export function isMobileClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /2PescrowMobile|Android|iPhone|iPad|iPod/i.test(ua);
}
