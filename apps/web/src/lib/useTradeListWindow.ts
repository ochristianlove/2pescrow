import { useEffect, useMemo, useState } from "react";

export const TRADE_LIST_INITIAL = 5;
export const TRADE_LIST_PAGE_SIZE = 5;

/** Paginate trade lists: start with 5, each "view more" adds up to 5 more. */
export function useTradeListWindow<T>(items: T[], resetKey?: string | number) {
  const [visibleCount, setVisibleCount] = useState(TRADE_LIST_INITIAL);

  useEffect(() => {
    setVisibleCount(TRADE_LIST_INITIAL);
  }, [items.length, resetKey]);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  const hiddenCount = Math.max(0, items.length - visibleCount);

  return {
    visible,
    showMore: hiddenCount > 0,
    hiddenCount,
    expand: () =>
      setVisibleCount((current) => Math.min(items.length, current + TRADE_LIST_PAGE_SIZE)),
  };
}
