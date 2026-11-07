import assert from "node:assert/strict";
import test from "node:test";
import { faqSortOrders } from "./faqOrder";

test("FAQ reorder assigns the submitted order", () => {
  const result = faqSortOrders(["a", "b", "c"], ["c", "a", "b"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.orders, [
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  }
});

test("FAQ reorder rejects a partial or unknown list", () => {
  assert.equal(faqSortOrders(["a", "b"], ["a"]).ok, false);
  assert.equal(faqSortOrders(["a", "b"], ["a", "a"]).ok, false);
  assert.equal(faqSortOrders(["a", "b"], ["a", "missing"]).ok, false);
});
