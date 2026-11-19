import { TranslatedText } from "../lib/language";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useRoute } from "../lib/router";
import { useLanguage } from "../lib/language";
import { ContractTerms } from "../components/ContractTerms";

type Snapshot = {
  title: string;
  terms: string;
  amount: string;
  token: string;
  network: string;
  status: string;
  createdAt: string;
  issuedAt: string;
  parties: { buyer: { name: string; wallet: string }; seller: { name: string; wallet: string } };
  contractAddress: string;
  transactions: { label: string; hash: string }[];
};

type VerifyResponse = { valid: boolean; issuedAt?: string; snapshotHash?: string; snapshot?: Snapshot; error?: string };

function displayNetwork(network: string) {
  if (network.startsWith("Tron")) return network;
  if (/legacy|earlier evm/i.test(network)) return "Earlier EVM trade";
  return network;
}

function explorerLink(network: string, addressOrTx: string) {
  if (network.startsWith("Tron")) return `https://tronscan.org/#/${addressOrTx.startsWith("T") ? "address" : "transaction"}/${addressOrTx}`;
  if (network.startsWith("Ethereum")) {
    const kind = addressOrTx.startsWith("0x") && addressOrTx.length === 66 ? "tx" : "address";
    return `https://etherscan.io/${kind}/${addressOrTx}`;
  }
  return null;
}

export function VerifyTradeRecordPage() {
  const { params } = useRoute("/verify/:recordId");
  const { t, language } = useLanguage();
  const [record, setRecord] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<VerifyResponse>(`/v1/public/trade-records/${encodeURIComponent(params.recordId || "")}`)
      .then((data) => { if (active) setRecord(data); })
      .catch((error) => { if (active) setRecord({ valid: false, error: error instanceof Error ? error.message : "Record not found" }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.recordId]);

  return (
    <div className="page verify-record-page">
      <section className="card-surface verify-record-card">
        <p className="eyebrow"><TranslatedText text={"2Pescrow ·"} /> {t("Independent record verification")}</p>
        <h1>{t("Trade record")}</h1>
        {loading && <p className="muted">{t("Checking record integrity…")}</p>}
        {!loading && record?.valid && record.snapshot && <>
          <p className="ok-banner" role="status">{t("Verified: this record matches the snapshot issued by 2Pescrow.")}</p>
          <p className="muted">{t("This confirms the agreement snapshot only. Check the blockchain links below for on-chain activity; it does not confirm delivery or decide a dispute.")}</p>
          <dl className="kv">
            <dt>{t("Trade")}</dt><dd>{record.snapshot.title}</dd>
            <dt>{t("Amount")}</dt><dd>{record.snapshot.amount} {record.snapshot.token}</dd>
            <dt>{t("Network")}</dt><dd>{displayNetwork(record.snapshot.network)}</dd>
            <dt>{t("Buyer")}</dt><dd>{record.snapshot.parties.buyer.name} · <span className="mono">{record.snapshot.parties.buyer.wallet}</span></dd>
            <dt>{t("Seller")}</dt><dd>{record.snapshot.parties.seller.name} · <span className="mono">{record.snapshot.parties.seller.wallet}</span></dd>
            <dt>{t("Created")}</dt><dd>{new Date(record.snapshot.createdAt).toLocaleString(language)}</dd>
            <dt>{t("Record issued")}</dt><dd>{new Date(record.issuedAt || record.snapshot.issuedAt).toLocaleString(language)}</dd>
            <dt>{t("Status at issue")}</dt><dd>{record.snapshot.status}</dd>
            <dt>{t("Escrow contract")}</dt><dd>{explorerLink(record.snapshot.network, record.snapshot.contractAddress) ? <a href={explorerLink(record.snapshot.network, record.snapshot.contractAddress)!} target="_blank" rel="noreferrer">{record.snapshot.contractAddress}</a> : <span className="mono">{record.snapshot.contractAddress}</span>}</dd>
            {record.snapshot.terms && <><dt>{t("Terms")}</dt><dd className="verify-record-terms"><ContractTerms text={record.snapshot.terms} empty="" /></dd></>}
          </dl>
          <h2>{t("Blockchain transactions")}</h2>
          {record.snapshot.transactions.length ? (
  <ul className="activity-list verify-tx-list">
    {record.snapshot.transactions.map((tx, i) => {
      const href = explorerLink(record.snapshot!.network, tx.hash);
      return (
        <li key={`${tx.hash}-${i}`} className="verify-tx-item">
          <div className="verify-tx-label"><strong>{t(tx.label)}</strong></div>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="mono verify-tx-hash">
              {tx.hash} ↗
            </a>
          ) : (
            <span className="mono verify-tx-hash">{tx.hash}</span>
          )}
        </li>
      );
    })}
  </ul>
) : (
  <p className="muted">{t("No indexed transactions were attached to this snapshot.")}</p>
)}
          <p className="verify-record-hash"><span className="muted">SHA-256</span><br /><code>{record.snapshotHash}</code></p>
        </>}
        {!loading && record && !record.valid && <p className="error-banner" role="alert">{record.error || t("This record could not be verified. It may have been altered or is no longer available.")}</p>}
      </section>
    </div>
  );
}
