/** Assigns 0..n-1 from the submitted id list. Every existing id must appear once. */
export function faqSortOrders(existingIds: string[], orderedIds: string[]): { ok: true; orders: { id: string; sortOrder: number }[] } | { ok: false; error: string } {
  if (orderedIds.length !== existingIds.length || new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, error: "Send each FAQ once, in the order it should appear." };
  }
  const known = new Set(existingIds);
  if (orderedIds.some((id) => !known.has(id))) {
    return { ok: false, error: "That list includes an FAQ that no longer exists." };
  }
  return { ok: true, orders: orderedIds.map((id, sortOrder) => ({ id, sortOrder })) };
}
