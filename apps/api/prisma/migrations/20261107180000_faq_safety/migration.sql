-- Safety questions for the public FAQ page.
INSERT INTO "FaqEntry" ("id", "question", "answer", "published", "sort_order", "created_at", "updated_at") VALUES
(
  'faq-safety-trade',
  'How safe is a trade on 2Pescrow?',
  'The buyer pays from their own wallet into an escrow smart contract. 2Pescrow does not hold that money, and it is not a bank. The tokens stay in the contract until the trade is finished, or until a dispute is paid out under the rules in that contract.',
  true,
  4,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-safety-funds',
  'How are the funds protected?',
  'The contract is the lock. The seller cannot take the payment early, and 2Pescrow cannot move it into a company account. A normal finish releases the payment when the deal is done. If a dispute is open, only the configured resolver wallet can pay it out, and only in the way the contract allows: a refund to the buyer, or a payout to the seller with the platform fee.',
  true,
  5,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-safety-unsettled',
  'What happens if a dispute cannot be settled?',
  'The tokens stay in the contract. They are not sent to 2Pescrow. The person who opened the dispute, or the resolver, can withdraw the dispute and put the trade back to the step it was on. A final ruling is paid on-chain. Until that transaction confirms, nothing leaves the contract.',
  true,
  6,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-safety-privacy',
  'Is my personal information kept private?',
  'Your email, trade chat, and uploaded evidence are stored by 2Pescrow. They are not written into the smart contract. The other person on the trade can see the chat and evidence, and staff can see them when a dispute is open. Wallet addresses and token transfers are public on the blockchain. 2Pescrow never asks for your private key or seed phrase.',
  true,
  7,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-safety-spend',
  'Can the other person spend the escrow?',
  'No. They never receive the payment into their wallet at the start. It sits in the contract. They can receive it only when the contract releases it at the end of the trade, or when a dispute ruling pays them.',
  true,
  8,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-safety-silence',
  'What if the other person stops responding?',
  'Open a dispute from the trade. The payment stays locked while staff read the chat and evidence. A final ruling pays the outcome on-chain. If you opened the dispute and both sides want to continue, the dispute can be withdrawn and the trade resumes.',
  true,
  9,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
