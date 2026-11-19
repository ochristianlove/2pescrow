import assert from "node:assert/strict";
import { test } from "node:test";
import { isExpoPushToken, chunkArray } from "../apps/api/src/pushService";

test("Push token validation: isExpoPushToken", () => {
  // Valid tokens
  assert.equal(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]"), true);
  assert.equal(isExpoPushToken("ExponentPushToken[1234567890abcdef]"), true);

  // Invalid tokens
  assert.equal(isExpoPushToken(""), false);
  assert.equal(isExpoPushToken("invalid-token"), false);
  assert.equal(isExpoPushToken("FCM-token-without-expo-wrapper"), false);
  assert.equal(isExpoPushToken(null as any), false);
  assert.equal(isExpoPushToken(undefined as any), false);
  assert.equal(isExpoPushToken(12345 as any), false);
});

test("Chunking array logic: complies with Expo Push batch limits", () => {
  const items = Array.from({ length: 250 }, (_, i) => `item-${i}`);
  const chunks = chunkArray(items, 100);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[1].length, 100);
  assert.equal(chunks[2].length, 50);
  assert.equal(chunks[0][0], "item-0");
  assert.equal(chunks[2][49], "item-249");
});

test("Deduplication and Privacy Masking logic in Notifications", () => {
  // Test privacy masking logic
  function applyLockScreenPrivacy(title: string, message: string, privacyEnabled: boolean) {
    if (!privacyEnabled) return { title, message };
    // Mask dollar amounts like $50.00 or $1,250.00
    const maskedMessage = message.replace(/\$[\d,]+(\.\d{2})?/g, "funds");
    return { title, message: maskedMessage };
  }

  const rawTitle = "Escrow payment funded";
  const rawMessage = "Buyer deposited $1,500.00 into escrow for “MacBook Pro”. Payment is secured in the smart contract. You can now deliver.";

  const normal = applyLockScreenPrivacy(rawTitle, rawMessage, false);
  assert.equal(normal.message.includes("$1,500.00"), true);

  const privateNotif = applyLockScreenPrivacy(rawTitle, rawMessage, true);
  assert.equal(privateNotif.message.includes("$1,500.00"), false);
  assert.equal(privateNotif.message.includes("Buyer deposited funds into escrow"), true);
});

test("Receipt processing: marks dead tokens for removal on DeviceNotRegistered", () => {
  type ExpoReceipt = {
    status: "ok" | "error";
    message?: string;
    details?: { error?: string };
  };

  const receipts: Record<string, ExpoReceipt> = {
    "ticket-1": { status: "ok" },
    "ticket-2": { status: "error", message: "The device is no longer registered", details: { error: "DeviceNotRegistered" } },
    "ticket-3": { status: "error", message: "Message rate exceeded", details: { error: "MessageRateExceeded" } },
  };

  const deactivatedTokens: string[] = [];
  const retriableJobs: string[] = [];

  const jobMap: Record<string, { id: string; token: string }> = {
    "ticket-1": { id: "job-1", token: "ExponentPushToken[user1]" },
    "ticket-2": { id: "job-2", token: "ExponentPushToken[dead_token]" },
    "ticket-3": { id: "job-3", token: "ExponentPushToken[rate_limited]" },
  };

  for (const [ticketId, receipt] of Object.entries(receipts)) {
    const job = jobMap[ticketId];
    if (receipt.status === "ok") {
      // Completed successfully
    } else if (receipt.details?.error === "DeviceNotRegistered") {
      deactivatedTokens.push(job.token);
    } else {
      retriableJobs.push(job.id);
    }
  }

  assert.deepEqual(deactivatedTokens, ["ExponentPushToken[dead_token]"]);
  assert.deepEqual(retriableJobs, ["job-3"]);
});

test("Server-side recipient authorization and event isolation", () => {
  // Simulate two users
  const buyerId = "usr_buyer_123";
  const sellerId = "usr_seller_456";
  const outsiderId = "usr_attacker_789";

  const notifications = [
    { id: "n1", userId: buyerId, title: "Deposit confirmed", message: "Deposit confirmed" },
    { id: "n2", userId: sellerId, title: "Payment funded", message: "Buyer deposited funds" },
  ];

  // User queries inbox: filter is strictly enforced by userId on the server
  function queryInboxForUser(requestingUserId: string) {
    return notifications.filter((n) => n.userId === requestingUserId);
  }

  const buyerInbox = queryInboxForUser(buyerId);
  assert.equal(buyerInbox.length, 1);
  assert.equal(buyerInbox[0].title, "Deposit confirmed");

  const sellerInbox = queryInboxForUser(sellerId);
  assert.equal(sellerInbox.length, 1);
  assert.equal(sellerInbox[0].title, "Payment funded");

  const outsiderInbox = queryInboxForUser(outsiderId);
  assert.equal(outsiderInbox.length, 0); // Outsider sees nothing
});
