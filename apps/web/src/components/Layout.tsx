import { useLanguage as useCopyLanguage } from "../lib/language";
import { useState, type ReactNode } from "react";
import { Link, useRouter } from "../lib/router";
import { useAuth } from "../lib/auth";
import { dashboardPath } from "../lib/dashboardPath";
import { isStaffUser } from "../lib/workspaceGate";
import { SiteHead } from "./SiteHead";
import { WalletControl } from "./WalletControl";
import { usePlatformSettings } from "../lib/platformSettings";
import { languageOptions, useLanguage } from "../lib/language";
import { MobileBottomNav } from "./MobileBottomNav";
import { NotificationBell } from "./NotificationBell";
import { SiteDock } from "./SiteDock";
import { SocialMark, socialLinks } from "./CommunityLinks";
import { brandSrc, DEFAULT_LOGO } from "../lib/brand";
import { userDisplayLabel } from "../lib/userDisplay";
import { WalletConnectionNotice } from "./WalletConnectionNotice";

function languageCode(id: string) {
  return id === "pt-BR" ? "PT" : id.toUpperCase();
}

function LanguageMenu({ className }: { className: string }) {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className={`language-picker ${className}`}>
      <button type="button" className="language-picker-button" aria-label={t("Language")} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((value) => !value)}>
        {languageCode(language)}
      </button>
      {open ? (
        <div className="language-picker-menu" role="listbox" aria-label={t("Language")}>
          {languageOptions.map((option) => (
            <button key={option.id} type="button" role="option" aria-selected={language === option.id} onClick={() => { setLanguage(option.id); setOpen(false); }}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t: localizeCopy } = useCopyLanguage();
  const { path, navigate } = useRouter();
  const { user, signOut } = useAuth();
  const dash = dashboardPath(user);
  const hideChrome = path.startsWith("/sys/");
  const isHome = path === "/";
  const showFooter = isHome || path === "/blog" || path.startsWith("/blog/") || path === "/terms" || path === "/privacy" || path === "/faq" || path === "/help";
  const { settings } = usePlatformSettings();
  const { t } = useLanguage();
  const brandTitle = settings?.siteTitle?.trim() || "2Pescrow";
  const escrowFactory = settings?.factoryAddress?.trim() || "0x08Be929Ac784E8aEe20403c4F5bbEE2668e183c9";
  const logoUrl = brandSrc(settings?.siteLogoUrl, DEFAULT_LOGO);

  return (
    <div className={`shell${hideChrome ? "" : " shell-app"}`}>
      <SiteHead />
      {!hideChrome && <WalletConnectionNotice />}
      <div className="atmosphere" aria-hidden />
      {!hideChrome && (
        <>
        <header className="topbar topbar-app">
          <div className="topbar-app-inner">
          <Link to={user ? dash : "/"} className="brand brand-app" aria-label={localizeCopy(brandTitle.replace(/\s*—.*$/, "").trim() || "2Pescrow")}>
            <img src={logoUrl} alt="" className="brand-logo-wide" />
          </Link>
          <nav className="nav nav-desktop">
            {user ? <Link to={dash}>{t(isStaffUser(user) ? "Admin panel" : "Dashboard")}</Link> : <Link to="/">{t("Home")}</Link>}
            <Link to="/trades">{t("Trades")}</Link>
            <Link to={user ? "/trades/new" : "/signin?next=%2Ftrades%2Fnew"}>{t("Start a trade")}</Link>
            <Link to={user ? "/join" : "/signin?next=%2Fjoin"}>{t("Join a trade")}</Link>
            <Link to="/referrals">{t("Referrals")}</Link>
            <Link to="/blog">{t("Blog")}</Link>
            {!user ? <Link to="/signin">{t("Sign in")}</Link> : null}
          </nav>
          <div className="wallet-slot wallet-slot-header">
            <LanguageMenu className="language-picker-desktop" />
            <div className="header-account-desktop">
              {user && (
                <button
                  type="button"
                  className="secondary"
                  title={user.email || undefined}
                  onClick={() => navigate(dash)}
                >
                  {userDisplayLabel(user)}
                </button>
              )}
              {user && (
                <button type="button" className="secondary" onClick={() => signOut()}>
                  {t("Sign out")}
                </button>
              )}
            </div>
          </div>
          <div className="topbar-app-tools">
            <LanguageMenu className="language-picker-mobile" />
            {user ? <NotificationBell /> : null}
            <div className="wallet-actions-app">
              <WalletControl />
            </div>
          </div>
          </div>
        </header>
        </>
      )}
      <main className={`main${hideChrome ? "" : " main-app"}${isHome ? " main-home" : ""}`}>{children}</main>
      {!hideChrome && <MobileBottomNav />}
      {!hideChrome && <SiteDock />}
      {!hideChrome && settings?.feedbackEnabled && (
        <Link className="floating-feedback floating-feedback-desktop" to="/feedback" aria-label={t("Send feedback")} title={t("Send feedback")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-3 2v-5.2A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11.5h8M8 14.5h5" /></svg>
          <span>{t("Feedback")}</span>
        </Link>
      )}
      {!hideChrome && showFooter && (
        <footer className="footer footer-desktop site-footer">
          <div className="site-footer-brand">
            <img src={logoUrl} alt={localizeCopy(brandTitle.replace(/\s*—.*$/, "").trim() || "2Pescrow")} className="brand-logo-wide brand-logo-footer" />
            <p>{t("2Pescrow is Web3 peer-to-peer escrow. Two people trade directly, and the payment stays in a smart contract until the deal is done.")}</p>
            <div className="site-footer-socials">
              {socialLinks(settings).map((link) => (
                <a key={link.id} href={link.href} target="_blank" rel="noreferrer">
                  <SocialMark id={link.id} />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h2>{t("Trade")}</h2>
            <Link to={user ? "/trades/new" : "/signin"}>{t("Start a trade")}</Link>
            <Link to={user ? "/join" : "/signin"}>{t("Join a trade")}</Link>
            <Link to="/trades">{t("Open trades")}</Link>
            <Link to="/referrals">{t("Referrals")}</Link>
            <Link to="/faq">{t("FAQ")}</Link>
            <Link to="/help">{t("Help")}</Link>
          </div>
          <div>
            <h2>{t("Read")}</h2>
            <Link to="/blog">{t("Blog")}</Link>
            <a href={`https://etherscan.io/address/${escrowFactory}`} target="_blank" rel="noreferrer">Etherscan</a>
            <Link to="/terms">{t("Terms")}</Link>
            <Link to="/privacy">{t("Privacy")}</Link>
          </div>
          <p className="site-footer-legal">
            {t("Payments go from the buyer's wallet into an escrow smart contract. 2Pescrow does not hold them. A dispute is settled only by the rules in that contract. 2Pescrow is not a bank.")}{" "}
            <Link to="/terms">{t("Read the Terms.")}</Link>
          </p>
        </footer>
      )}
    </div>
  );
}
