export type SessionUser = {
  id: string;
  email: string | null;
  role: string;
  displayName: string | null;
  permissions?: string[];
  wallets?: { id?: string; address: string; chainKind?: string }[];
};

export type TradeRow = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  tokenSymbol: string;
  amountAtomic: string;
  tradeCode?: string | null;
  partyRole?: "buyer" | "seller" | "admin" | "party";
  chain?: string;
  contractAddress?: string | null;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  updatedAt?: string;
  messages?: TradeMessage[];
};

export type TradeMessage = {
  id: string;
  authorUserId?: string | null;
  kind: string;
  body: string;
  createdAt: string;
};

export type FaqItem = { id: string; question: string; answer: string };

export type ReferralView = {
  enrolled: boolean;
  referralCode?: string;
  referralUrl?: string;
};
