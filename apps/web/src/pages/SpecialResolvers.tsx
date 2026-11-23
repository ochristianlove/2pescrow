import { useState, type FormEvent } from "react";
import { TranslatedText } from "../lib/language";
import { Link, useRouter } from "../lib/router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function SpecialResolversPage() {
  const { user, authHeaders } = useAuth();
  const { navigate } = useRouter();
  const [category, setCategory] = useState<"escrow_lawyer" | "escrow_operator">("escrow_lawyer");
  const [organization, setOrganization] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submitApplication(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) {
      navigate("/signin");
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
    <div className="page" style={{ maxWidth: "1080px", margin: "0 auto", display: "grid", gap: "3.5rem" }}>
      {/* Editorial masthead following direction.json ("The printed annual": strict axis, oversized tight headline, stark contrast) */}
      <section
        className="card-surface"
        style={{
          padding: "clamp(2rem, 5vw, 4rem)",
          display: "grid",
          gap: "2rem",
          borderTop: "3px solid var(--accent, #22c55e)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem", alignItems: "end" }}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p className="eyebrow"><TranslatedText text={"Partner Programme · Special Resolvers"} /></p>
            <p className="muted" style={{ maxWidth: "34ch", fontSize: "1.02rem", lineHeight: 1.55 }}>
              <TranslatedText text={"Bring your clients to non-custodial Ethereum smart-contract escrow, govern your own cases on-chain, and receive 50% of protocol trade fees automatically to your resolver wallet."} />
            </p>
          </div>
          <h1
            style={{
              fontSize: "clamp(2.3rem, 5.4vw, 4.1rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.04em",
              margin: 0,
              fontWeight: 600,
            }}
          >
            <TranslatedText text={"Run your escrow practice on Ethereum."} />
          </h1>
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
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 500, letterSpacing: "-0.03em" }}>50%</div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Of the 10% platform trade fee (= 5% of trade volume), paid automatically on-chain."} />
            </p>
          </div>
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 500, letterSpacing: "-0.03em" }}>
              <TranslatedText text={"Your cases only"} />
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Trades registered via your partner link bind exclusively to your resolver wallet."} />
            </p>
          </div>
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 500, letterSpacing: "-0.03em" }}>
              <TranslatedText text={"Direct wallet"} />
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"No manual payout requests. Earnings land straight in your wallet to withdraw anytime."} />
            </p>
          </div>
          <div>
            <div style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 500, letterSpacing: "-0.03em" }}>
              <TranslatedText text={"Verified only"} />
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <TranslatedText text={"Open strictly to credentialed escrow lawyers and established escrow operators."} />
            </p>
          </div>
        </div>
      </section>

      {/* Eligibility & Scope */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "1.5rem" }}>
        <article className="card-surface" style={{ padding: "2rem", display: "grid", gap: "0.85rem" }}>
          <p className="eyebrow"><TranslatedText text={"Track 01 · Legal Advocates"} /></p>
          <h2 style={{ margin: 0, letterSpacing: "-0.02em" }}><TranslatedText text={"Escrow Lawyers & Arbitrators"} /></h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            <TranslatedText text={"Licensed attorneys and legal advocates who represent counterparties and adjudicate commercial settlements. Applicants must provide verifiable bar credentials, firm registration, or active legal practice proof."} />
          </p>
        </article>
        <article className="card-surface" style={{ padding: "2rem", display: "grid", gap: "0.85rem" }}>
          <p className="eyebrow"><TranslatedText text={"Track 02 · Established Operators"} /></p>
          <h2 style={{ margin: 0, letterSpacing: "-0.02em" }}><TranslatedText text={"Traditional & Telegram Escrow Hosts"} /></h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            <TranslatedText text={"Experienced OTC brokers, Telegram escrow desk operators, and existing trading communities that want non-custodial Ethereum smart-contract infrastructure while retaining full dispute authority over their own clients."} />
          </p>
        </article>
      </section>

      {/* How the deal works (run-in editorial column) */}
      <section className="card-surface" style={{ padding: "clamp(1.75rem, 4vw, 3rem)", display: "grid", gap: "1.25rem" }}>
        <h2 style={{ margin: 0, letterSpacing: "-0.025em" }}><TranslatedText text={"How the Special Resolver partnership works"} /></h2>
        <div style={{ display: "grid", gap: "1rem", maxWidth: "70ch", lineHeight: 1.65 }}>
          <p style={{ margin: 0 }}>
            <strong><TranslatedText text={"Referral-bound authority."} /></strong>{" "}
            <span className="muted">
              <TranslatedText text={"Once approved under a signed agreement with 2Pescrow, you receive your partner referral link and your Ethereum wallet is registered on our ResolverRouter smart contract. Every trade created by users who register through your link automatically binds your wallet on-chain—and you cannot access or claim general 2Pescrow pool disputes outside your client network."} />
            </span>
          </p>
          <p style={{ margin: 0 }}>
            <strong><TranslatedText text={"50% automatic fee share (replaces referral commissions)."} /></strong>{" "}
            <span className="muted">
              <TranslatedText text={"Special Resolvers do not earn standard manual referral commissions. Instead, whenever one of your referred trades completes—whether released normally by the buyer or settled in seller favor during a dispute—the smart contract automatically splits the 10% protocol fee 50/50: half routes directly to your assigned resolver wallet, and half routes to 2Pescrow."} />
            </span>
          </p>
          <p style={{ margin: 0 }}>
            <strong><TranslatedText text={"Self-funded resolution gas & full custody."} /></strong>{" "}
            <span className="muted">
              <TranslatedText text={"You keep full control of your resolver wallet. You fund the small Ethereum network gas required when signing an on-chain dispute ruling for your clients, and every USDT/USDC fee share sent to your wallet is immediately yours to hold or withdraw at any time."} />
            </span>
          </p>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="card-surface" style={{ padding: "clamp(1.75rem, 4vw, 3rem)", display: "grid", gap: "1.5rem" }}>
        <div>
          <p className="eyebrow"><TranslatedText text={"Apply for verification"} /></p>
          <h2 style={{ margin: "0.35rem 0 0", letterSpacing: "-0.025em" }}>
            <TranslatedText text={"Request Special Resolver onboarding"} />
          </h2>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            <TranslatedText text={"Submit proof of your legal practice or active escrow platform and the public Ethereum wallet you want authorized for your clients."} />
          </p>
        </div>

        {submitted ? (
          <div className="success-banner" style={{ padding: "1.25rem", borderRadius: "12px" }}>
            <strong><TranslatedText text={"Application received."} /></strong>{" "}
            <TranslatedText text={"Our admin team will review your credentials and contact you to finalize your Special Resolver agreement and activate your resolver wallet on-chain."} />
          </div>
        ) : !user ? (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn" to="/signin"><TranslatedText text={"Sign in to apply"} /></Link>
            <span className="muted"><TranslatedText text={"Create or sign in to your 2Pescrow account so we can attach your partner referral link."} /></span>
          </div>
        ) : (
          <form onSubmit={submitApplication} style={{ display: "grid", gap: "1rem", maxWidth: "640px" }}>
            {error && <p className="error-banner">{error}</p>}
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Partner category"} /></span>
              <select value={category} onChange={(e) => setCategory(e.target.value as "escrow_lawyer" | "escrow_operator")}>
                <option value="escrow_lawyer">Escrow Lawyer / Legal Advocate</option>
                <option value="escrow_operator">Traditional / Telegram Escrow Operator</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Law firm, desk, or trading group name"} /></span>
              <input
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Chambers Legal Escrow or @YourEscrowDesk"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Evidence link (bar directory, firm website, Telegram group, or track record)"} /></span>
              <input
                required
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Your Ethereum resolver wallet (public 0x address)"} /></span>
              <input
                required
                className="mono"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span><TranslatedText text={"Describe your escrow volume & how you handle disputes"} /></span>
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
