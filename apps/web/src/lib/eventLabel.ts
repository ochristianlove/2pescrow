/** Stored names such as SellerJoined have no space. Split them only when no translation exists. */
export function eventLabel(eventName: string, translate: (value: string) => string) {
  const label = translate(eventName);
  if (label !== eventName) return label;
  return eventName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
