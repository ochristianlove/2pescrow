import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "../lib/router";
import { useLanguage } from "../lib/language";
import "./FaqPage.css";

type FaqItem = { id: string; question: string; answer: string };

export const FALLBACK_FAQ: FaqItem[] = [
  {
    id: "referrer",
    question: "What does a referrer earn?",
    answer: "Share your link. When someone you referred finishes a successful trade, you earn 2% of the platform fee on that trade. The platform fee is 10% of the trade plus $1 to open it. Your cut is 2% of that fee, not 2% of the whole trade. Cash-out starts at $20, and an admin sends it to your wallet.",
  },
  {
    id: "agent",
    question: "What does a dispute agent earn?",
    answer: "An admin approves you before you can handle disputes. Commission does not start at approval. You opt in from your account with your name and a payout wallet. The default rate is 0.5% of the platform fee on a case. It is paid only after that dispute is paid out on-chain. You need 5 finalized cases, and at least $20, before you can cash out.",
  },
  {
    id: "withheld",
    question: "When is agent commission withheld?",
    answer: "The first 7 days after you opt in, finished cases are not paid. You also earn nothing on a case where you are the buyer or seller. A recommendation or a provisional ruling does not pay. An admin can set a different rate for one agent, or shorten that 7-day wait. You cannot pick your own rate.",
  },
  {
    id: "stack",
    question: "Can an agent also use the referral program?",
    answer: "Yes. Referral earnings and case commission are separate and they stack. Referring a trader does not replace the pay for handling a dispute, and handling a dispute does not replace the referral cut.",
  },
  {
    id: "safety-trade",
    question: "How safe is a trade on 2Pescrow?",
    answer: "The buyer pays from their own wallet into an escrow smart contract. 2Pescrow does not hold that money, and it is not a bank. The tokens stay in the contract until the trade is finished, or until a dispute is paid out under the rules in that contract.",
  },
  {
    id: "safety-funds",
    question: "How are the funds protected?",
    answer: "The contract is the lock. The seller cannot take the payment early, and 2Pescrow cannot move it into a company account. A normal finish releases the payment when the deal is done. If a dispute is open, only the configured resolver wallet can pay it out, and only in the way the contract allows: a refund to the buyer, or a payout to the seller with the platform fee.",
  },
  {
    id: "safety-unsettled",
    question: "What happens if a dispute cannot be settled?",
    answer: "The tokens stay in the contract. They are not sent to 2Pescrow. The person who opened the dispute, or the resolver, can withdraw the dispute and put the trade back to the step it was on. A final ruling is paid on-chain. Until that transaction confirms, nothing leaves the contract.",
  },
  {
    id: "safety-privacy",
    question: "Is my personal information kept private?",
    answer: "Your email, trade chat, and uploaded evidence are stored by 2Pescrow. They are not written into the smart contract. The other person on the trade can see the chat and evidence, and staff can see them when a dispute is open. Wallet addresses and token transfers are public on the blockchain. 2Pescrow never asks for your private key or seed phrase.",
  },
  {
    id: "safety-spend",
    question: "Can the other person spend the escrow?",
    answer: "No. They never receive the payment into their wallet at the start. It sits in the contract. They can receive it only when the contract releases it at the end of the trade, or when a dispute ruling pays them.",
  },
  {
    id: "safety-silence",
    question: "What if the other person stops responding?",
    answer: "Open a dispute from the trade. The payment stays locked while staff read the chat and evidence. A final ruling pays the outcome on-chain. If you opened the dispute and both sides want to continue, the dispute can be withdrawn and the trade resumes.",
  },
];

export function FaqPage() {
  const { t } = useLanguage();
  const [faqs, setFaqs] = useState<FaqItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<FaqItem[]>("/v1/faq")
      .then((rows) => {
        if (!cancelled) setFaqs(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = failed ? FALLBACK_FAQ : faqs ?? [];

  return (
    <div className="page faq-page">
      <h1>{t("FAQ")}</h1>
      <p className="muted">
        {t("Plain answers about how a trade stays safe, what happens in a dispute, and how referral and agent pay works.")}
      </p>
      {faqs === null && !failed && <p className="muted">{t("Loading…")}</p>}
      {faqs !== null && faqs.length === 0 && (
        <p className="muted">{t("No questions are published yet.")}</p>
      )}
      <div className="faq-list">
        {entries.map((entry) => (
          <details key={entry.id}>
            <summary>{t(entry.question)}</summary>
            <p>{t(entry.answer)}</p>
          </details>
        ))}
      </div>
      <p className="faq-more">
        <Link to="/terms">{t("Terms")}</Link>
        {" · "}
        <Link to="/privacy">{t("Privacy")}</Link>
      </p>
    </div>
  );
}
