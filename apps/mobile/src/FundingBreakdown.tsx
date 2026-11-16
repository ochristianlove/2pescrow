import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "./api";
import { formatAmount, tokenLabel } from "./format";
import { Text } from "./language";
import { colors } from "./theme";
import { readCreationFee, readTokenBalance, readTronCreationFee } from "./tradeChain";
import type { TradeRow } from "./types";
import { Button } from "./ui";

type WalletConfig = {
  tokens?: { USDT?: string | null; USDC?: string | null; TRON_USDT?: string | null };
  factoryAddress?: string | null;
  tronFactoryAddress?: string | null;
};

export type FundingHint = "connect-ethereum" | "switch-ethereum" | "connect-tron" | null;

export type FundingQuote = {
  fee: bigint;
  required: bigint;
  balance: bigint | null;
  balanceLoading: boolean;
  balanceError: string | null;
  refreshing: boolean;
  reload: () => void;
  token: string;
};

function parseAtomic(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function useCreationFee(chain: string | undefined) {
  const [fee, setFee] = useState(1_000_000n);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await api<WalletConfig>("/v1/config/wallets");
        const next = chain === "tron"
          ? (config.tronFactoryAddress ? await readTronCreationFee(config.tronFactoryAddress) : 1_000_000n)
          : (config.factoryAddress ? await readCreationFee(config.factoryAddress) : 1_000_000n);
        if (!cancelled) setFee(next);
      } catch {
        if (!cancelled) setFee(1_000_000n);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chain]);
  return fee;
}

export function useFundingQuote(trade: TradeRow, walletAddress: string | null, enabled: boolean): FundingQuote {
  const [fee, setFee] = useState(1_000_000n);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setBalanceLoading(true);
    setRefreshing(nonce > 0);
    void (async () => {
      try {
        const config = await api<WalletConfig>("/v1/config/wallets");
        const nextFee = trade.chain === "tron"
          ? (config.tronFactoryAddress ? await readTronCreationFee(config.tronFactoryAddress) : 1_000_000n)
          : (config.factoryAddress ? await readCreationFee(config.factoryAddress) : 1_000_000n);
        if (cancelled) return;
        setFee(nextFee);
        if (trade.chain === "tron" || !walletAddress) {
          setBalance(null);
          setBalanceError(null);
          return;
        }
        const tokenAddress = trade.tokenSymbol === "USDC" ? config.tokens?.USDC : config.tokens?.USDT;
        if (!tokenAddress) {
          setBalance(null);
          setBalanceError("Token contract address is not configured.");
          return;
        }
        setBalance(await readTokenBalance(walletAddress, tokenAddress));
        setBalanceError(null);
      } catch (error) {
        if (cancelled) return;
        setBalance(null);
        setBalanceError(error instanceof Error ? error.message : "Could not read token balance");
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce, trade.chain, trade.id, trade.tokenSymbol, trade.updatedAt, walletAddress]);

  return {
    fee,
    required: parseAtomic(trade.amountAtomic) + fee,
    balance,
    balanceLoading,
    balanceError,
    refreshing,
    reload: () => setNonce((value) => value + 1),
    token: tokenLabel(trade.tokenSymbol),
  };
}

function money(atomic: string, token: string) {
  return `${token} ${formatAmount(atomic)}`;
}

export function FundingBreakdown({
  trade,
  quote,
  hint,
}: {
  trade: TradeRow;
  quote: FundingQuote;
  hint: FundingHint;
}) {
  const title = trade.status === "Created" ? "Fund the escrow" : "Check funds before locking";
  const short = quote.balance != null && quote.balance < quote.required ? quote.required - quote.balance : null;
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>Buyer funding</Text>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
      <Row label="Trade amount" value={money(trade.amountAtomic, quote.token)} />
      <Row label="Creation fee" value={money(quote.fee.toString(), quote.token)} />
      <Row label="Required token balance" value={money(quote.required.toString(), quote.token)} emphasize />
      <Row
        label="Connected wallet balance"
        value={quote.balanceLoading ? "Loading…" : quote.balance == null ? "—" : money(quote.balance.toString(), quote.token)}
      />
      {hint === "connect-tron" ? <Text style={hintStyle}>Connect a TRON wallet to load the token balance.</Text> : null}
      {hint === "connect-ethereum" ? <Text style={hintStyle}>Connect your Ethereum wallet to load the token balance.</Text> : null}
      {hint === "switch-ethereum" ? <Text style={hintStyle}>Switch your wallet to Ethereum to load the token balance.</Text> : null}
      {quote.balanceError ? <Text style={{ color: colors.danger, lineHeight: 20 }}>Balance unavailable: {quote.balanceError}</Text> : null}
      {trade.chain === "tron" ? (
        <Text style={hintStyle}>TRON has two steps: create the escrow contract (TRX network fee; no USDT is sent), then approve and fund it (trade amount plus the $1 creation fee).</Text>
      ) : null}
      {short != null ? (
        <Text style={hintStyle}>
          Insufficient token balance: {money(short.toString(), quote.token)}. Add funds to this wallet before deploying and funding the trade. The invitation itself does not lock funds.
        </Text>
      ) : null}
      {!trade.sellerAddress ? <Text style={hintStyle}>Available after the seller links a receiving wallet.</Text> : null}
      <Button label="Refresh token balance" tone="ghost" busy={quote.refreshing} disabled={quote.balanceLoading} onPress={quote.reload} />
    </View>
  );
}

function Row({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Text style={{ color: colors.muted, flex: 1, lineHeight: 20 }}>{label}</Text>
      <Text translate={value === "Loading…"} style={{ color: emphasize ? colors.gold : colors.text, fontWeight: emphasize ? "800" : "600", lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

const hintStyle = { color: colors.muted, fontSize: 13, lineHeight: 19 };
