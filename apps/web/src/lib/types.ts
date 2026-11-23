export type EscrowStatus =
  | "AwaitingSeller"
  | "AwaitingFunding"
  | "ActionRequired"
  | "Created"
  | "Funded"
  | "InProgress"
  | "Completed"
  | "Cancelled"
  | "Disputed"
  | "Resolved";

export type Escrow = {
  id: string;
  chain?: string;
  title: string;
  description?: string | null;
  status: EscrowStatus | string;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  tradeCode?: string | null;
  buyerUserId?: string | null;
  sellerUserId?: string | null;
  buyerUser?: { id: string; displayName: string | null; email?: string | null } | null;
  sellerUser?: { id: string; displayName: string | null; email?: string | null } | null;
  partyRole?: "buyer" | "seller" | "admin" | "party";
  joinDeadlineAt?: string | null;
  fundDeadlineAt?: string | null;
  deliveryDeadlineAt?: string | null;
  reviewDeadlineAt?: string | null;
  deliveryWindowHours?: number;
  reviewWindowHours?: number;
  agentAddress?: string | null;
  tokenSymbol: string;
  tokenAddress: string;
  amountAtomic: string;
  contractAddress?: string | null;
  proofHash?: string | null;
  createTxHash?: string | null;
  createdAt?: string;
  updatedAt?: string;
  disputes?: Dispute[];
  events?: EscrowEvent[];
  messages?: TradeMessage[];
};

export type TradeMessage = {
  id: string;
  authorUserId?: string | null;
  recipientUserId?: string | null;
  kind: "user" | "system" | "evidence" | "fulfilment" | string;
  body: string;
  fileName?: string | null;
  fileAvailable?: boolean;
  createdAt: string;
};

export type DisputeAppeal = {
  id: string;
  status: string;
  reason?: string;
  filedByParty?: string;
  upholdRuling?: boolean | null;
  decisionNote?: string | null;
  createdAt?: string;
  decidedAt?: string | null;
};

export type Dispute = {
  id: string;
  escrowId: string;
  status: string;
  openedBy: string;
  openedByUserId?: string | null;
  buyerFavor?: boolean | null;
  rulingNote?: string | null;
  appealDeadlineAt?: string | null;
  resolution?: string | null;
  resolverAddress?: string | null;
  evidence?: DisputeEvidence[];
  appeal?: DisputeAppeal | null;
  createdAt?: string;
  handledByAdmin?: boolean;
  handledByAdminAt?: string | null;
  assignedAgentUserId?: string | null;
  assignedModeratorUserId?: string | null;
  assignedModerator?: { id: string; email: string | null; displayName: string | null } | null;
  assignedBy?: { id: string; email: string | null; displayName: string | null } | null;
  assignedAt?: string | null;
  ownerUserId?: string | null;
  owner?: { id: string; email: string | null; displayName: string | null; role?: string } | null;
  claimedAt?: string | null;
  awaitingRulingTier?: "moderator" | "admin" | string | null;
  recommendationBuyerFavor?: boolean | null;
  recommendationNote?: string | null;
  recommendedAt?: string | null;
  recommendedBy?: { id: string; email: string | null; displayName: string | null } | null;
  staffMessages?: {
    id: string;
    body: string;
    createdAt: string;
    author?: { id: string; email: string | null; displayName: string | null; role?: string } | null;
  }[];
};

export type DisputeEvidence = {
  id: string;
  submittedBy: string;
  fileName?: string | null;
  note?: string | null;
  contentHash?: string | null;
  createdAt?: string;
};

export type EscrowEvent = {
  id: string;
  eventName: string;
  txHash?: string | null;
  createdAt?: string;
  payload?: Record<string, unknown> | null;
};

export type Activity = {
  id: string;
  eventName: string;
  txHash?: string;
  explorerTx?: string | null;
  explorerContract?: string | null;
  escrow: { title: string; contractAddress?: string | null };
};

export type WalletConfig = {
  roles: Record<string, string>;
  addresses: Record<string, string>;
  tokens: Record<string, string | null | undefined>;
  factoryAddress?: string | null;
  ethereumExplorer: string;
  tronSupportEnabled?: boolean;
  tronFactoryAddress?: string | null;
  tronExplorer?: string;
};

export type PlatformSettings = {
  id: number;
  feeRecipientWallet: string;
  resolutionMode: string;
  agentModeEnabled: boolean;
  usdcAddress: string;
  usdtAddress: string;
  thirdStablecoinAddress: string;
  factoryAddress?: string | null;
  tronSupportEnabled: boolean;
  tronUsdtAddress?: string | null;
  tronFactoryAddress?: string | null;
  tronFeeRecipientWallet?: string | null;
  tronResolverWallet?: string | null;
  emailConfigured?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  smtpSecure?: boolean;
  smtpPassConfigured?: boolean;
  siteTitle?: string | null;
  siteLogoUrl?: string | null;
  siteFaviconUrl?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  feedbackEnabled?: boolean;
  referralLeaderboardEnabled?: boolean;
  mobileAppsEnabled?: boolean;
  iosAppStoreUrl?: string | null;
  androidPlayStoreUrl?: string | null;
  telegramUrl?: string | null;
  xUrl?: string | null;
  discordUrl?: string | null;
  remindersEnabled?: boolean;
  reminderEmailSubject?: string | null;
  reminderEmailBody?: string | null;
  siteNoticeEnabled?: boolean;
  siteNoticeTitle?: string;
  siteNoticeBody?: string;
  siteNoticeAudience?: "all" | "mobile" | "desktop";
  siteNoticeDelaySeconds?: number;
  siteNoticeRevision?: number;
  disputeAppealMessage?: string;
  disputeFinalMessage?: string;
  disputeEmailNotificationsEnabled?: boolean;
  disputeAppealEmailSubject?: string;
  disputeFinalEmailSubject?: string;
  disputeAppealDecisionMessage?: string;
  disputeAppealDecisionEmailSubject?: string;
  fieldNotesLimit?: number;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  coverImageUrl?: string | null;
  published?: boolean;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type FeedbackSubmission = {
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  category: string;
  subject: string | null;
  message: string;
  pagePath: string | null;
  status: string;
  adminNote: string | null;
  emailSent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  permissions?: string[];
  createdAt: string;
  wallets: { address: string; chainKind: string }[];
  referrer: { id: string; referralCode: string; tier: string } | null;
  resolverWallet?: string | null;
};

export type Agent = {
  id: string;
  walletAddress: string;
  displayName: string;
  feeBps: number;
  disputesResolved: number;
  active: boolean;
};
