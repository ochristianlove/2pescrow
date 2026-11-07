import { Link, useRouter } from "../lib/router";
import { useAuth } from "../lib/auth";
import { dashboardPath } from "../lib/dashboardPath";
import { useLanguage } from "../lib/language";

type TabKey = "home" | "escrows" | "create" | "join" | "profile";

function TabSvg({ tab, active }: { tab: TabKey; active: boolean }) {
  const stroke = active ? "var(--accent)" : "var(--muted)";
  const common = { fill: "none", stroke, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (tab) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden className="app-bottom-nav-icon">
          <path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" fill={active ? "var(--accent)" : "none"} />
        </svg>
      );
    case "escrows":
      return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden className="app-bottom-nav-icon">
          <path {...common} d="M7 11V7a5 5 0 0 1 10 0v4M6 11h12v10H6V11Z" />
        </svg>
      );
    case "create":
      return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden className="app-bottom-nav-icon">
          <path {...common} stroke="var(--primary-fg)" d="M12 5v14M5 12h14" />
        </svg>
      );
    case "join":
      return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden className="app-bottom-nav-icon">
          <path {...common} d="M7 11h10M7 15h6M10 7V5a2 2 0 1 1 4 0v2M6 11h12v10H6V11Z" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden className="app-bottom-nav-icon">
          <path {...common} d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path {...common} d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      );
  }
}

export function MobileBottomNav() {
  const { path } = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const dash = dashboardPath(user);
  const homeTo = user ? dash : "/";
  const createTo = user ? "/trades/new" : "/signin";
  const joinTo = user ? "/join" : "/signin";
  const profileTo = user ? "/app/profile" : "/signin";

  const tabs: { key: TabKey; to: string; label: string; match: (p: string) => boolean; fab?: boolean }[] = [
    { key: "home", to: homeTo, label: t("Home"), match: (p) => p === "/" || p === dash || p === "/app" },
    { key: "escrows", to: "/trades", label: t("Escrows"), match: (p) => p === "/trades" || (p.startsWith("/trades/") && !p.startsWith("/trades/new")) },
    { key: "create", to: createTo, label: t("Start"), match: (p) => p === "/trades/new", fab: true },
    { key: "join", to: joinTo, label: t("Join"), match: (p) => p === "/join" },
    {
      key: "profile",
      to: profileTo,
      label: user ? t("Profile") : t("Sign in"),
      match: (p) => (user ? p === "/app/profile" || p.startsWith("/app/profile") : p === "/signin"),
    },
  ];

  return (
    <nav className="app-bottom-nav" aria-label={t("Primary navigation")}>
      <ul className="app-bottom-nav-list">
        {tabs.map((tab) => {
          const active = tab.match(path);
          if (tab.fab) {
            return (
              <li key={tab.key} className="app-bottom-nav-item app-bottom-nav-fab">
                <Link to={tab.to} className={`app-bottom-fab-link${active ? " is-active" : ""}`} aria-label={tab.label}>
                  <span className="app-bottom-fab-button">
                    <TabSvg tab="create" active={active} />
                  </span>
                  <span className="app-bottom-nav-label">{tab.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={tab.key} className="app-bottom-nav-item">
              <Link to={tab.to} className={`app-bottom-tab${active ? " is-active" : ""}`}>
                <span className="app-bottom-tab-icon-slot">
                  <TabSvg tab={tab.key} active={active} />
                </span>
                <span className="app-bottom-nav-label">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
