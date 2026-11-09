import { useCallback, useEffect, useState } from "react";
import { api, formatAmount, mediaUrl, shortAddr } from "../lib/api";
import { Link, useRouter } from "../lib/router";
import { StatusBadge } from "../components/StatusBadge";
import { CopyButton } from "../components/CopyButton";
import type { Activity, BlogPost, Escrow } from "../lib/types";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";
import { usePlatformSettings } from "../lib/platformSettings";
import { SocialMark, socialLinks } from "../components/CommunityLinks";
import { eventLabel } from "../lib/eventLabel";
import { TradePartyBadge } from "../components/TradePartyBadge";
import { FALLBACK_FAQ } from "./Faq";
import "./HomePage.css";

type HomeReferral = {
  enrolled: boolean;
  referralUrl?: string;
};

const HOME_FAQ_PREVIEW = 3;

function HomeFaqPreview() {
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [items, setItems] = useState(FALLBACK_FAQ.slice(0, HOME_FAQ_PREVIEW));

  useEffect(() => {
    let cancelled = false;
    api<{ id: string; question: string; answer: string }[]>("/v1/faq")
      .then((rows) => {
        if (!cancelled && rows.length > 0) setItems(rows.slice(0, HOME_FAQ_PREVIEW));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="home-faq" aria-labelledby="home-faq-title">
      <div className="section-head">
        <h2 id="home-faq-title">{t("FAQ")}</h2>
      </div>
      <div className="home-faq-list">
        {items.map((entry) => (
          <details key={entry.id}>
            <summary>{t(entry.question)}</summary>
            <p>{t(entry.answer)}</p>
          </details>
        ))}
      </div>
      <button type="button" className="home-faq-more" onClick={() => navigate("/faq")}>
        {t("Load more")}
      </button>
    </section>
  );
}

/** Marketing landing — green + gold brand system (HomePage.css). */
export function HomePage() {
  const { navigate } = useRouter();
  const { user, authHeaders } = useAuth();
  const { t } = useLanguage();
  const { settings } = usePlatformSettings();
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<BlogPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [referral, setReferral] = useState<HomeReferral | null>(null);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const postsPromise = api<BlogPost[]>("/v1/blog?limit=6")
          .then((posts) => {
            if (!cancelled) setNotes(posts.slice(0, 6));
          })
          .catch(() => {
            if (!cancelled) setNotes([]);
          });
        const [list, act] = await Promise.all([
          api<Escrow[]>("/v1/escrows"),
          api<Activity[]>("/v1/activity"),
          postsPromise,
        ]);
        if (!cancelled) {
          setEscrows(list);
          setActivity(act);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? "Live activity is temporarily unavailable. Please try again shortly."
              : "Live activity is temporarily unavailable.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = escrows.slice(0, 4);
  const startTo = user ? "/trades/new" : "/signin?next=%2Ftrades%2Fnew";
  const joinTo = user ? "/join" : "/signin?next=%2Fjoin";
  const signInForLink = "/signin?next=%2F";

  const loadReferral = useCallback(async () => {
    if (!user) {
      setReferral(null);
      return;
    }
    const profile = await api<HomeReferral>("/v1/me/referral", { headers: authHeaders() });
    setReferral(profile);
  }, [user, authHeaders]);

  useEffect(() => {
    if (!user) {
      setReferral(null);
      return;
    }
    let cancelled = false;
    loadReferral().catch((e) => {
      if (!cancelled) setReferralError(e instanceof Error ? e.message : t("Could not load your referral link."));
    });
    return () => {
      cancelled = true;
    };
  }, [user, loadReferral, t]);

  async function createReferralLink() {
    setReferralBusy(true);
    setReferralError(null);
    try {
      const created = await api<{ referralUrl: string }>("/v1/referral/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      setReferral({ enrolled: true, referralUrl: created.referralUrl });
    } catch (e) {
      setReferralError(e instanceof Error ? e.message : t("Could not create your referral link."));
    } finally {
      setReferralBusy(false);
    }
  }

  async function shareReferralLink() {
    const url = referral?.referralUrl;
    if (!url) return;
    setShareNote(null);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "2Pescrow",
          text: t("Join a trade on 2Pescrow with my link."),
          url,
        });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setShareNote(t("Copy the link, then paste it into the chat or app you use."));
  }

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-orb home-hero-orb-a" aria-hidden />
        <div className="home-hero-orb home-hero-orb-b" aria-hidden />
        <div className="home-hero-grid" aria-hidden />

        <div className="home-hero-layout">
          <div className="home-hero-copy">
            <p className="eyebrow home-hero-kicker-desktop">{t("ERC-20 on Ethereum is available now")}</p>
            <p className="eyebrow home-hero-kicker-mobile">{t("ERC-20 on Ethereum, locked until the deal is done")}</p>
            <h1 id="home-hero-title" className="home-hero-brand">
              {t("Pay a stranger without handing them the money.")}
            </h1>
            <p className="home-hero-lead home-hero-lead-desktop">
              {settings?.tronSupportEnabled
                ? t("Open a trade, pass a short code, and meet the other person in one shared room. Their USDT sits in an Ethereum or Tron smart contract until delivery is accepted. 2Pescrow never holds the funds.")
                : t("Open a trade, pass a short code, and meet the other person in one shared room. Their USDT sits in an Ethereum smart contract until delivery is accepted. 2Pescrow never holds the funds.")}
            </p>
            <p className="home-hero-lead home-hero-lead-mobile">
              {t(
                "Open a trade, pass a short code, and meet the other person in one shared room. On a phone, the buyer funds ERC-20 USDT or ERC-20 USDC on Ethereum. The coins sit in the smart contract until delivery is accepted. 2Pescrow never holds the funds.",
              )}
            </p>
            <div className="home-hero-actions">
              <button type="button" onClick={() => navigate(startTo)}>
                {t("Start a trade")}
              </button>
              <button type="button" className="secondary home-cta-gold" onClick={() => navigate(joinTo)}>
                {t("Join a trade")}
              </button>
            </div>
            <ul className="home-hero-stats" aria-label={t("Platform snapshot")}>
              <li className="home-hero-stat">
                <strong>$1</strong>
                {t("to open a trade")}
              </li>
              <li className="home-hero-stat">
                <strong>90 / 10</strong>
                {t("seller / protocol on release")}
              </li>
              <li className="home-hero-stat">
                <strong>{escrows.length}</strong>
                {t("trades on the ledger")}
              </li>
            </ul>
            {error && (
              <p className="muted" role="status">
                {t(error)}
              </p>
            )}
          </div>

          <aside className="home-hero-panel" aria-label={t("A trade in motion")}>
            <div className="home-panel-head">
              <span>{t("Shared room")}</span>
              <span className="home-panel-live">{t("Both sides")}</span>
            </div>
            <ol className="home-panel-steps">
              <li className="home-panel-step">
                <span className="home-panel-step-num">1</span>
                <span className="home-panel-step-label">{t("You set the terms")}</span>
                <span className="home-panel-step-tag">{t("Code")}</span>
              </li>
              <li className="home-panel-step">
                <span className="home-panel-step-num">2</span>
                <span className="home-panel-step-label">{t("They confirm a wallet")}</span>
                <span className="home-panel-step-tag">{t("Join")}</span>
              </li>
              <li className="home-panel-step">
                <span className="home-panel-step-num">3</span>
                <span className="home-panel-step-label">{t("Buyer funds the contract")}</span>
                <span className="home-panel-step-tag">{t("USDT")}</span>
              </li>
              <li className="home-panel-step is-gold">
                <span className="home-panel-step-num">4</span>
                <span className="home-panel-step-label">{t("Release, or open a dispute")}</span>
                <span className="home-panel-step-tag">{t("Your call")}</span>
              </li>
            </ol>
          </aside>
        </div>
      </section>

      <div className="home-trust-bar" role="list">
        <div className="home-trust-pill" role="listitem">
          <strong>{t("Non-custodial")}</strong>
          {t("The contract holds the tokens, not us")}
        </div>
        <div className="home-trust-pill" role="listitem">
          <strong>{t("One room")}</strong>
          {t("Same history for both people")}
        </div>
        <div className="home-trust-pill" role="listitem">
          <strong>{t("Either side")}</strong>
          {t("The open seat decides who joins")}
        </div>
      </div>

      <section className="home-flow-section home-coins home-coins-mobile" aria-labelledby="home-coins-title">
        <h2 id="home-coins-title">{t("Yes, we are accepting these coins.")}</h2>
        <div className="home-flow-grid home-flow-grid-3">
          <article className="home-flow-card is-eth-usdt">
            <div className="home-flow-card-index">01</div>
            <h3>{t("ERC-20 USDT")}</h3>
            <p>{t("On Ethereum. The funds sit in the smart contract until delivery is accepted.")}</p>
          </article>
          <article className="home-flow-card is-eth-usdc">
            <div className="home-flow-card-index">02</div>
            <h3>{t("ERC-20 USDC")}</h3>
            <p>{t("On Ethereum. The funds sit in the smart contract until delivery is accepted.")}</p>
          </article>
          {settings?.tronSupportEnabled && <article className="home-flow-card is-tron-usdt">
            <div className="home-flow-card-index">03</div>
            <h3>{t("TRC-20 USDT")}</h3>
            <p>{t("On Tron. The buyer funds a Tron contract, and the coins stay there until release.")}</p>
          </article>}
        </div>
      </section>

      <section className="home-flow-section home-coins-desktop" aria-labelledby="home-networks-title">
        <div className="home-networks-heading">
          <div>
            <p className="eyebrow">{t("NETWORK STATUS")}</p>
            <h2 id="home-networks-title">
              {settings?.tronSupportEnabled
                ? t("Ethereum and TRON are available.")
                : t("Trade on Ethereum with ERC-20.")}
            </h2>
          </div>
          <p>
            {settings?.tronSupportEnabled
              ? t("Choose ERC-20 on Ethereum or TRC-20 on Tron for your trade.")
              : t("Use USDT or USDC on Ethereum. Your trade funds stay in the escrow contract until settlement.")}
          </p>
        </div>
        <div className={`home-network-rails${settings?.tronSupportEnabled ? "" : " home-network-rails-single"}`}>
          <article className="home-network-card home-network-card-live">
            <div className="home-network-card-top">
              <span>{t("01 / ETHEREUM")}</span>
              <span className="home-network-status is-live">{t("Available")}</span>
            </div>
            <h3>{t("ERC-20")}</h3>
            <p className="home-network-summary">{t("Trade with USDT or USDC on Ethereum.")}</p>
            <ul className="home-network-tokens" aria-label={t("Available Ethereum tokens")}>
              <li>USDT</li>
              <li>USDC</li>
            </ul>
          </article>
          {settings?.tronSupportEnabled && <article className="home-network-card home-network-card-tron is-enabled">
            <div className="home-network-card-top">
              <span>{t("02 / TRON")}</span>
              <span className="home-network-status is-live">
                {t("Available")}
              </span>
            </div>
            <h3>{t("TRC-20")}</h3>
            <p className="home-network-summary">{t("USDT on Tron")}</p>
            <p className="home-network-note">
              {t("TRC-20 trades are enabled.")}
            </p>
          </article>}
        </div>
      </section>

      <section className="home-flow-section" aria-labelledby="home-flow-title">
        <h2 id="home-flow-title">{t("Three moves. Then the chain does the holding.")}</h2>
        <div className="home-flow-grid home-flow-grid-3">
          <article className="home-flow-card">
            <div className="home-flow-card-index">01</div>
            <h3>{t("Write the deal")}</h3>
            <p>{t("Amount, token, chain, and the wallet you already know. You leave with a code, not a public listing.")}</p>
          </article>
          <article className="home-flow-card">
            <div className="home-flow-card-index">02</div>
            <h3>{t("Hand them the code")}</h3>
            <p>{t("They see the terms you wrote, including the wallet already lodged, and lock in their own address before the trade closes.")}</p>
          </article>
          <article className="home-flow-card">
            <div className="home-flow-card-index">03</div>
            <h3>{t("Fund only when both are in")}</h3>
            <p>{t("The buyer deposits USDT. Release pays the seller 90% and the protocol 10%. A dispute keeps the coins in the contract until it is decided.")}</p>
          </article>
        </div>
      </section>

      <section className="home-community" aria-labelledby="home-community-title">
        <div>
          <p className="eyebrow">{t("Community")}</p>
          <h2 id="home-community-title">{t("Ask in the room you already use.")}</h2>
          <p className="muted">{t("Telegram for a fast answer, Discord when the thread needs room, X when we ship something. None of these move funds.")}</p>
        </div>
        <div className="home-community-grid">
          {socialLinks(settings).map((link) => (
            <a key={link.id} className="home-community-card" href={link.href} target="_blank" rel="noreferrer">
              <SocialMark id={link.id} />
              <strong>{link.label}</strong>
              <span>{t(link.hint)}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="home-referral-band" aria-labelledby="home-referral-title">
        <div className="home-referral-copy">
          <h2 id="home-referral-title">{t("Send someone here. Earn 2%.")}</h2>
          <p>
            {t(
              "When a trade from your link finishes, you earn 2% of the platform fee. Copy the link and share it. Payouts stay on your referral page.",
            )}
          </p>
          <Link to="/referrals">{t("Open the referral page")}</Link>
        </div>
        <div className="home-referral-share">
          {!user && (
            <>
              <p>{t("Sign in to get a personal link you can copy and send.")}</p>
              <button type="button" onClick={() => navigate(signInForLink)}>
                {t("Get my link")}
              </button>
            </>
          )}
          {user && !referral && !referralError && <p className="muted">{t("Loading your link…")}</p>}
          {referralError && (
            <p className="error-banner" role="alert">
              {referralError}
            </p>
          )}
          {user && referral && !referral.enrolled && (
            <button type="button" disabled={referralBusy} onClick={() => void createReferralLink()}>
              {referralBusy ? t("Creating link…") : t("Create my link")}
            </button>
          )}
          {user && referral?.enrolled && referral.referralUrl && (
            <>
              <label className="home-referral-field">
                <span>{t("Your link")}</span>
                <input readOnly value={referral.referralUrl} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <div className="home-referral-actions">
                <CopyButton text={referral.referralUrl} className="" label={t("Copy link")} copiedLabel={t("Link copied")} />
                <button type="button" className="secondary" onClick={() => void shareReferralLink()}>
                  {t("Share")}
                </button>
              </div>
              {shareNote && <p className="muted">{shareNote}</p>}
            </>
          )}
        </div>
      </section>

      <HomeFaqPreview />

      <section className="home-notes" aria-labelledby="home-notes-title">
        <div className="section-head">
          <h2 id="home-notes-title">{t("Field notes")}</h2>
          <Link to="/blog">{t("All notes")}</Link>
        </div>
        {notes.length === 0 ? (
          <p className="muted">{t("Notes land here after they are published from the admin desk.")}</p>
        ) : (
          <ul className="blog-list blog-list-home">
            {notes.map((post) => (
              <li key={post.id}>
                <button type="button" className="blog-card" onClick={() => navigate(`/blog/${post.slug}`)}>
                  {post.coverImageUrl ? (
                    <img className="blog-card-thumb" src={mediaUrl(post.coverImageUrl)} alt="" />
                  ) : (
                    <span className="blog-card-fallback" aria-hidden />
                  )}
                  <span className="blog-card-copy">
                    {post.publishedAt && (
                      <time dateTime={post.publishedAt}>
                        {new Date(post.publishedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                    )}
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-home home-ledger-section">
        <section className="section">
          <div className="section-head">
            <h2>{t("Latest on the ledger")}</h2>
            <Link to="/trades">{t("See all")}</Link>
          </div>
          {recent.length === 0 && <p className="muted">{t("No trades yet. The first one will show up here.")}</p>}
          <ul className="trade-list">
            {recent.map((e) => (
              <li key={e.id}>
                <button type="button" className="trade-row" onClick={() => navigate(`/trades/${e.id}`)}>
                  <span className="trade-row-main">
                    <strong>{e.title}</strong>
                    {user && <TradePartyBadge escrow={e} userId={user.id} walletAddresses={user.wallets?.map((wallet) => wallet.address)} />}
                  </span>
                  <StatusBadge status={e.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="section">
          <h2>{t("What just happened")}</h2>
          {activity.length === 0 && <p className="muted">{t("Deposits, proofs, and releases show up in this list.")}</p>}
          <ul className="activity-list">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id}>
                <strong>{eventLabel(a.eventName, t)}</strong>
                <span className="muted"> — {a.escrow.title}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
