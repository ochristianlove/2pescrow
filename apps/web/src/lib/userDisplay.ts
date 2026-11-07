/** Display name when set, otherwise email, otherwise `fallback`. */
export function userDisplayLabel(
  user: { displayName?: string | null; email?: string | null } | null | undefined,
  fallback = "",
) {
  if (!user) return fallback;
  const name = user.displayName?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return fallback;
}
