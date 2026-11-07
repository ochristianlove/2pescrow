export type TronWebLike = {
  ready?: boolean;
  defaultAddress?: { base58?: string; hex?: string };
  fullNode?: { host: string };
  contract: (abi?: unknown[], address?: string) => {
    at: (address: string) => Promise<TronContractLike>;
  };
  address: {
    fromHex: (hex: string) => string;
    toHex: (base58: string) => string;
  };
  trx: {
    getBalance: (address: string) => Promise<number>;
    sendRawTransaction: (transaction: unknown) => Promise<{
      result?: boolean;
      txid?: string;
      code?: string;
      message?: string;
    }>;
    getTransactionInfo: (txId: string) => Promise<{
      id?: string;
      result?: string;
      resMessage?: string;
      contractResult?: string[];
      receipt?: { result?: string };
      log?: { address?: string; topics?: string[]; data?: string }[];
    }>;
  };
  transactionBuilder: {
    triggerSmartContract: (
      contractAddress: string,
      functionSelector: string,
      options: { feeLimit: number; callValue: number; shouldPollResponse: boolean },
      parameters: { type: string; value: unknown }[],
      issuerAddress: string,
    ) => Promise<{
      result?: { result?: boolean; message?: string };
      transaction?: unknown;
      Error?: string;
    }>;
    addUpdateData: (transaction: unknown, data: string, dataFormat?: "utf8" | "hex") => Promise<unknown>;
  };
};

export type TronContractLike = {
  factory: () => { call: () => Promise<unknown> };
  resolver: () => { call: () => Promise<unknown> };
  balanceOf: (address: string) => { call: () => Promise<unknown> };
  approve: (spender: string, amount: string | number) => { send: () => Promise<string> };
  fund: () => { send: () => Promise<string> };
  submitProof: (hash: string) => { send: () => Promise<string> };
  approveRelease: () => { send: () => Promise<string> };
  requestCancel: () => { send: () => Promise<string> };
  refuseCancel: () => { send: () => Promise<string> };
  state: () => { call: () => Promise<unknown> };
  buyerCancelRequested: () => { call: () => Promise<unknown> };
  deliveryProofHash: () => { call: () => Promise<unknown> };
  openDispute: () => { send: () => Promise<string> };
  freezeDispute: (opener: string) => { send: () => Promise<string> };
  withdrawDispute: () => { send: () => Promise<string> };
  resolveDispute: (buyerFavor: boolean) => { send: () => Promise<string> };
  createEscrow: (
    buyer: string,
    seller: string,
    token: string,
    amount: string | number,
    agent: string
  ) => { send: () => Promise<string> };
};

