export type SessionUser = {
  id: string;
  email: string | null;
  role: string;
  displayName: string | null;
  hideFromPublicLedger?: boolean;
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
  createTxHash?: string | null;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  createdAt?: string | null;
  updatedAt?: string;
  messages?: TradeMessage[];
  events?: TradeEvent[];
  disputes?: TradeDispute[];
  buyerUserId?: string | null;
  sellerUserId?: string | null;
  buyerUser?: { id: string; displayName?: string | null } | null;
  sellerUser?: { id: string; displayName?: string | null } | null;
  joinDeadlineAt?: string | null;
  fundDeadlineAt?: string | null;
  deliveryDeadlineAt?: string | null;
  reviewDeadlineAt?: string | null;
  deliveryWindowHours?: number | null;
  reviewWindowHours?: number | null;
  proofHash?: string | null;
};

export type TradeMessage = {
  id: string;
  authorUserId?: string | null;
  kind: string;
  body: string;
  createdAt: string;
  fileName?: string | null;
  fileAvailable?: boolean;
};

export type TradeEvent = {
  id: string; eventName: string; createdAt?: string; txHash?: string | null;
  payload?: { disputeId?: string } | null;
};
export type TradeDispute = {
  id: string; status: string; createdAt?: string; openedBy?: string | null;
  openedByUserId?: string | null; buyerFavor?: boolean | null;
  rulingNote?: string | null; resolution?: string | null; appealDeadlineAt?: string | null;
  assignedModerator?: { displayName?: string | null } | null;
  appeal?: { status: string; reason?: string; decisionNote?: string | null } | null;
  evidence?: { id: string; fileName?: string | null; note?: string | null; createdAt?: string }[];
};

export type FaqItem = { id: string; question: string; answer: string };

export type ReferralView = {
  enrolled: boolean;
  referralCode?: string;
  referralUrl?: string;
};
