import { useState, type FormEvent } from "react";
import { TranslatedText, useLanguage } from "../lib/language";
import { Link, useRouter } from "../lib/router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const VOLUME_PRESETS = [25_000, 100_000, 250_000, 1_000_000];

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SpecialResolversPage() {
  const { user, authHeaders } = useAuth();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [monthlyVolume, setMonthlyVolume] = useState(100_000);
  const [category, setCategory] = useState<"escrow_lawyer" | "escrow_operator">("escrow_lawyer");
  const [organization, setOrganization] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const protocolFee = monthlyVolume * 0.1;
  const partnerMonthly = protocolFee * 0.5;
  const partnerAnnual = partnerMonthly * 12;

  async function submitApplication(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) {
      navigate("/signin?next=%2Fspecial-resolvers");
      return;
    }
    setSubmitting(true);
    try {
      await api("/v1/me/special-resolver-application", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          category,
          organization: organization.trim(),
          proofUrl: proofUrl.trim(),
          walletAddress: walletAddress.trim(),
          note: note.trim(),
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: "1080px", margin: "0 auto", display: "grid", gap: "2.75rem" }}>
      {/* Editorial masthead for existing escrow providers and escrow lawyers */}
      <section
        className="card-surface"
        style={{
          padding: "clamp(2rem, 5vw, 3.75rem)",
          display: "grid",
          gap: "2rem",
          borderTop: "3px solid var(--warn, #e8b84a)",
          background:
            "radial-gradient(110% 80% at 95% 0%, rgba(232, 184, 74, 0.14), transparent 55%), radial-gradient(90% 70% at 5% 100%, rgba(62, 207, 142, 0.12), transparent 55%), var(--surface, #0b1620)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", alignItems: "end" }}>
          <div style={{ display: "grid", gap: "0.95rem" }}>
            <p className="eyebrow" style={{ color: "var(--warn, #e8b84a)" }}>
              <TranslatedText text={"Partner Programme · Escrow Providers & Lawyers"} />
            </p>
            <h1
              style={{
                fontSize: "clamp(2.15rem, 5vw, 3.6rem)",
                lineHeight: 1.0,
                letterSpacing: "-0.04em",
                margin: 0,
                fontWeight: 700,
              }}
            >
              <TranslatedText text={"Run your own escrow service on 2Pescrow. Keep 50% of every fee."} />
            </h1>
            <p className="muted" style={{ maxWidth: "46ch", fontSize: "1.03rem", lineHeight: 1.6, margin: 0 }}>
              <TranslatedText text={"Built for existing escrow desks, OTC operators, and escrow lawyers. Upgrade your clients to non-custodial Ethereum smart contracts, submit your dedicated resolver wallet, govern your own clients' disputes on-chain, and receive 50% of protocol revenue automatically."} />
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.35rem" }}>
              <a
                href="#apply"
                className="btn"
                style={{
                  background: "linear-gradient(135deg, #e8b84a, #d4a043)",
                  color: "#161004",
                  fontWeight: 700,
                  border: "none",
                  textDecoration: "none",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "10px",
                }}
              >
                <TranslatedText text={"Apply as a Special Resolver"} />
              </a>
              <a
                href="#calculator"
                className="secondary"
                style={{
                  textDecoration: "none",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                <TranslatedText text={"Estimate 50% revenue share"} />
              </a>
            </div>
          </div>

          <aside
            style={{
              borderRadius: "14px",
              border: "1px solid rgba(232, 184, 74, 0.35)",
              background: "rgba(5, 14, 22, 0.78)",
              padding: "1.35rem",
              display: "grid",
              gap: "0.9rem",
            }}
          >
            <p className="eyebrow" style={{ margin: 0, color: "var(--accent, #3ecf8e)" }}>
              <TranslatedText text={"How the partnership works"} />
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.7rem", fontSize: "0.93rem", lineHeight: 1.45 }}>
              <li>
                <strong><TranslatedText text={"1. Dedicated resolver wallet:"} /></strong>{" "}
                <span className="muted"><TranslatedText text={"Submit your Ethereum wallet to be authorized on our ResolverRouter smart contract."} /></span>
              </li>
              <li>
                <strong><TranslatedText text={"2. Client ownership via partner link:"} /></strong>{" "}
                <span className="muted"><TranslatedText text={"Every user who registers through your link binds their trades strictly to your practice."} /></span>
              </li>
              <li>
                <strong><TranslatedText text={"3. Exclusive dispute resolution:"} /></strong>{" "}
                <span className="muted"><TranslatedText text={"You resolve disputes for your own clients—never mixed with general platform cases."} /></span>
              </li>
              <li>
                <strong><TranslatedText text={"4. Automatic 50/50 on-chain payout:"} /></strong>{" "}
                <span className="muted"><TranslatedText text={"Every completed trade splits the 10% protocol fee 50/50 straight into your wallet (replaces standard referral commissions)."} /></span>
              </li>
            </ul>
          </aside>
        </div>

        {/* 4-fact programme row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1.5rem",
            paddingTop: "1.75rem",
            borderTop: "1px solid var(--line, rgba(255,255,255,0.12))",
          }}
        >
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--warn, #e8b84a)" }}>50%</div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Of the 10% protocol fee (= 5% of trade volume), paid automatically on-chain."} />
            </p>
          </div>
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 600, letterSpacing: "-0.03em" }}>
              <TranslatedText text={"Your cases only"} />
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Trades created by clients who sign up through your link belong exclusively to your resolver wallet."} />
            </p>
          </div>
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 600, letterSpacing: "-0.03em" }}>
              <TranslatedText text={"Direct wallet"} />
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Zero invoicing or payout queues. USDT/USDC revenue settles straight to your wallet on release."} />
            </p>
          </div>
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 600, letterSpacing: "-0.03em" }}>
              <TranslatedText text={"Zero custody"} />
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Smart contracts lock client funds on Ethereum. You focus on clients and fair rulings."} />
            </p>
          </div>
        </div>
      </section>

      {/* Interactive 50% Revenue Share Calculator */}
      <section
        id="calculator"
        className="card-surface"
        style={{
          padding: "clamp(1.75rem, 4vw, 2.75rem)",
          display: "grid",
          gap: "1.5rem",
          border: "1px solid rgba(62, 207, 142, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div>
            <p className="eyebrow" style={{ color: "var(--accent, #3ecf8e)" }}>
              <TranslatedText text={"Partner Revenue Estimator"} />
            </p>
            <h2 style={{ margin: "0.25rem 0 0", letterSpacing: "-0.025em" }}>
              <TranslatedText text={"Estimate your 50% on-chain revenue share"} />
            </h2>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {VOLUME_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={monthlyVolume === preset ? "" : "secondary"}
                style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
                onClick={() => setMonthlyVolume(preset)}
              >
                {formatUsd(preset)}/mo
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
            <span className="muted"><TranslatedText text={"Monthly completed client escrow volume"} /></span>
            <strong style={{ fontSize: "1.25rem", fontVariantNumeric: "tabular-nums" }}>{formatUsd(monthlyVolume)}</strong>
          </div>
          <input
            type="range"
            min={10_000}
            max={2_000_000}
            step={5_000}
            value={monthlyVolume}
            onChange={(e) => setMonthlyVolume(Number(e.target.value))}
            aria-label={t("Monthly completed client escrow volume")}
            style={{ width: "100%", accentColor: "#e8b84a" }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div style={{ padding: "1.1rem", borderRadius: "12px", border: "1px solid var(--border)", background: "rgba(5, 14, 22, 0.55)" }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}><TranslatedText text={"Total 10% protocol fee"} /></span>
            <div style={{ fontSize: "1.55rem", fontWeight: 700, marginTop: "0.25rem", fontVariantNumeric: "tabular-nums" }}>
              {formatUsd(protocolFee)}
            </div>
          </div>
          <div style={{ padding: "1.1rem", borderRadius: "12px", border: "1px solid rgba(232, 184, 74, 0.45)", background: "rgba(232, 184, 74, 0.08)" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--warn, #e8b84a)", fontWeight: 600 }}>
              <TranslatedText text={"Your monthly on-chain share (50%)"} />
            </span>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--warn, #e8b84a)", fontVariantNumeric: "tabular-nums" }}>
              {formatUsd(partnerMonthly)}
            </div>
          </div>
          <div style={{ padding: "1.1rem", borderRadius: "12px", border: "1px solid rgba(62, 207, 142, 0.4)", background: "rgba(62, 207, 142, 0.08)" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--accent, #3ecf8e)", fontWeight: 600 }}>
              <TranslatedText text={"Annualized partner earnings"} />
            </span>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--accent, #3ecf8e)", fontVariantNumeric: "tabular-nums" }}>
              {formatUsd(partnerAnnual)}
            </div>
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.55 }}>
          <TranslatedText text={"Paid automatically in USDT or USDC directly to your authorized resolver wallet whenever a referred client trade completes—whether released normally by the buyer or resolved by you in seller favor. Standard 2% manual referral commissions do not apply to Special Resolver accounts."} />
        </p>
      </section>

      {/* Eligibility & Scope */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "1.5rem" }}>
        <article className="card-surface" style={{ padding: "2rem", display: "grid", gap: "0.85rem", alignContent: "start" }}>
          <p className="eyebrow" style={{ color: "var(--warn, #e8b84a)" }}><TranslatedText text={"Track 01 · Legal Advocates"} /></p>
          <h2 style={{ margin: 0, letterSpacing: "-0.02em" }}><TranslatedText text={"Escrow Lawyers & Law Firms"} /></h2>
          <p className="muted" style={{ lineHeight: 1.6, margin: 0 }}>
            <TranslatedText text={"Licensed attorneys, legal chambers, and commercial arbitrators who already handle escrow closings and commercial settlements. Replace trust-account friction with verifiable Ethereum smart contracts while retaining full adjudication control over your clients' disputes."} />
          </p>
          <p className="muted" style={{ fontSize: "0.86rem", margin: 0 }}>
            <strong><TranslatedText text={"Verification:"} /></strong>{" "}
            <TranslatedText text={"Bar directory listing, firm registration, or active legal practice profile."} />
          </p>
        </article>
        <article className="card-surface" style={{ padding: "2rem", display: "grid", gap: "0.85rem", alignContent: "start" }}>
          <p className="eyebrow" style={{ color: "var(--accent, #3ecf8e)" }}><TranslatedText text={"Track 02 · Established Providers"} /></p>
          <h2 style={{ margin: 0, letterSpacing: "-0.02em" }}><TranslatedText text={"Existing Escrow Services & OTC Desks"} /></h2>
          <p className="muted" style={{ lineHeight: 1.6, margin: 0 }}>
            <TranslatedText text={"Established escrow operators, Telegram escrow desks, and P2P/OTC communities running manual custody today. Run your own escrow practice on top of 2Pescrow's non-custodial smart contracts, eliminate wallet custody liability, and earn 50% of protocol fees on every deal."} />
          </p>
          <p className="muted" style={{ fontSize: "0.86rem", margin: 0 }}>
            <strong><TranslatedText text={"Verification:"} /></strong>{" "}
            <TranslatedText text={"Public website, active community/desk channel, or verifiable settlement track record."} />
          </p>
        </article>
      </section>

      {/* Comparison Table: Standard Referral vs Special Resolver Partner */}
      <section className="card-surface" style={{ padding: "clamp(1.75rem, 4vw, 2.75rem)", display: "grid", gap: "1.25rem" }}>
        <div>
          <p className="eyebrow"><TranslatedText text={"Partnership vs Standard Referral"} /></p>
          <h2 style={{ margin: "0.25rem 0 0", letterSpacing: "-0.025em" }}>
            <TranslatedText text={"Built for partners running a real escrow practice"} />
          </h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 0.65rem", color: "var(--muted)" }}><TranslatedText text={"Feature"} /></th>
                <th style={{ padding: "0.75rem 0.65rem", color: "var(--muted)" }}><TranslatedText text={"Standard Referral"} /></th>
                <th style={{ padding: "0.75rem 0.65rem", color: "var(--warn, #e8b84a)" }}><TranslatedText text={"Special Resolver Partner"} /></th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem 0.65rem", fontWeight: 600 }}><TranslatedText text={"Revenue share"} /></td>
                <td style={{ padding: "0.75rem 0.65rem", color: "var(--muted)" }}><TranslatedText text={"2% of protocol fee"} /></td>
                <td style={{ padding: "0.75rem 0.65rem", fontWeight: 700, color: "var(--accent, #3ecf8e)" }}><TranslatedText text={"50% of protocol fee (= 5% of volume)"} /></td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem 0.65rem", fontWeight: 600 }}><TranslatedText text={"Payout method"} /></td>
                <td style={{ padding: "0.75rem 0.65rem", color: "var(--muted)" }}><TranslatedText text={"Manual payout ledger"} /></td>
                <td style={{ padding: "0.75rem 0.65rem" }}><TranslatedText text={"Automatic on-chain split to your resolver wallet"} /></td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem 0.65rem", fontWeight: 600 }}><TranslatedText text={"Dispute resolution authority"} /></td>
                <td style={{ padding: "0.75rem 0.65rem", color: "var(--muted)" }}><TranslatedText text={"None (handled by 2Pescrow)"} /></td>
                <td style={{ padding: "0.75rem 0.65rem" }}><TranslatedText text={"Exclusive authority over all referred client cases"} /></td>
              </tr>
              <tr>
                <td style={{ padding: "0.75rem 0.65rem", fontWeight: 600 }}><TranslatedText text={"Scope isolation"} /></td>
                <td style={{ padding: "0.75rem 0.65rem", color: "var(--muted)" }}><TranslatedText text={"Referral link tracking only"} /></td>
                <td style={{ padding: "0.75rem 0.65rem" }}><TranslatedText text={"Scoped strictly to your clients—zero general pool clutter"} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* How the deal works (run-in editorial column) */}
      <section className="card-surface" style={{ padding: "clamp(1.75rem, 4vw, 3rem)", display: "grid", gap: "1.25rem" }}>
        <h2 style={{ margin: 0, letterSpacing: "-0.025em" }}><TranslatedText text={"Partnership methodology & on-chain guarantees"} /></h2>
        <div style={{ display: "grid", gap: "1rem", maxWidth: "74ch", lineHeight: 1.65 }}>
          <p style={{ margin: 0 }}>
            <strong><TranslatedText text={"Referral-bound client ownership."} /></strong>{" "}
            <span className="muted">
              <TranslatedText text={"Once approved under a partner agreement with 2Pescrow, you receive your partner referral link and your Ethereum wallet is registered on our two-tier ResolverRouter smart contract. Every trade opened by users who register via your link automatically binds your resolver wallet on-chain. That case belongs strictly to your practice, and you never view or claim unrelated 2Pescrow general pool disputes."} />
            </span>
          </p>
          <p style={{ margin: 0 }}>
            <strong><TranslatedText text={"50% automatic fee share (replaces referral commissions)."} /></strong>{" "}
            <span className="muted">
              <TranslatedText text={"Special Resolvers operate as full revenue partners rather than referral affiliates—manual referral commissions are voided. Instead, whenever any trade from your referred clients finishes—whether released smoothly by the buyer or settled in seller favor during a dispute—the EscrowDeal V2 smart contract automatically splits the 10% protocol fee 50/50 on-chain: half routes straight to your resolver wallet, and half routes to 2Pescrow."} />
            </span>
          </p>
          <p style={{ margin: 0 }}>
            <strong><TranslatedText text={"Full wallet custody & self-funded resolution gas."} /></strong>{" "}
            <span className="muted">
              <TranslatedText text={"You hold your own keys. You fund only the small Ethereum network gas when signing an on-chain dispute ruling for a client case, and every USDT/USDC fee share sent to your wallet is immediately yours to hold or withdraw at any time."} />
            </span>
          </p>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="card-surface" style={{ padding: "clamp(1.75rem, 4vw, 3rem)", display: "grid", gap: "1.5rem" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--warn, #e8b84a)" }}><TranslatedText text={"Apply for verification"} /></p>
          <h2 style={{ margin: "0.35rem 0 0", letterSpacing: "-0.025em" }}>
            <TranslatedText text={"Request Special Resolver partner onboarding"} />
          </h2>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            <TranslatedText text={"Submit proof of your legal practice or active escrow service along with the public Ethereum wallet you want authorized for your clients."} />
          </p>
        </div>

        {submitted ? (
          <div className="success-banner" style={{ padding: "1.25rem", borderRadius: "12px" }}>
            <strong><TranslatedText text={"Application received."} /></strong>{" "}
            <TranslatedText text={"Our admin team will review your credentials and contact you to finalize your Special Resolver agreement and authorize your resolver wallet on-chain."} />
          </div>
        ) : !user ? (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn" to="/signin?next=%2Fspecial-resolvers"><TranslatedText text={"Sign in to apply"} /></Link>
            <span className="muted"><TranslatedText text={"Create or sign in to your 2Pescrow account so we can attach your partner referral link and resolver wallet."} /></span>
          </div>
        ) : (
          <form onSubmit={submitApplication} style={{ display: "grid", gap: "1rem", maxWidth: "640px" }}>
            {error && <p className="error-banner">{error}</p>}
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Partner category"} /></span>
              <select value={category} onChange={(e) => setCategory(e.target.value as "escrow_lawyer" | "escrow_operator")}>
                <option value="escrow_lawyer">Escrow Lawyer / Law Firm</option>
                <option value="escrow_operator">Existing Escrow Provider / OTC Desk</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Law firm, escrow service, or OTC desk name"} /></span>
              <input
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Chambers Legal Escrow or @YourEscrowDesk"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Verification link (bar directory, firm website, Telegram desk, or track record)"} /></span>
              <input
                required
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Your dedicated Ethereum resolver wallet (public 0x address)"} /></span>
              <input
                required
                className="mono"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Describe your escrow volume & dispute process"} /></span>
              <textarea
                required
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Share your typical deal sizes, jurisdictions, and verification details…"
              />
            </label>
            <div>
              <button type="submit" disabled={submitting}>
                <TranslatedText text={submitting ? "Submitting…" : "Submit Special Resolver application"} />
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
