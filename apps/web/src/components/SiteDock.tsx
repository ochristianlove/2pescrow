import { Link, useRouter } from "../lib/router";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";
import { usePlatformSettings } from "../lib/platformSettings";
import { SocialMark, socialLinks } from "./CommunityLinks";

export function SiteDock() {
  const { path } = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { settings } = usePlatformSettings();
  const startTo = user ? "/trades/new" : "/signin?next=%2Ftrades%2Fnew";
  const joinTo = user ? "/join" : "/signin?next=%2Fjoin";

  const items = [
    { to: "/", label: t("Home"), active: path === "/" },
    { to: "/trades", label: t("Trades"), active: path === "/trades" || path.startsWith("/trades/") },
    { to: startTo, label: t("Start a trade"), active: path === "/trades/new" },
    { to: joinTo, label: t("Join a trade"), active: path === "/join" },
    { to: "/blog", label: t("Blog"), active: path === "/blog" || path.startsWith("/blog/") },
  ];

  return (
    <nav className="site-dock" aria-label={t("Site dock")}>
      <ul className="site-dock-list">
        {items.map((item) => (
          <li key={item.label}>
            <Link to={item.to} className={item.active ? "is-active" : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
        <li className="site-dock-rule" aria-hidden />
        {socialLinks(settings).map((link) => (
          <li key={link.id}>
            <a href={link.href} target="_blank" rel="noreferrer" aria-label={link.label} title={link.label}>
              <SocialMark id={link.id} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
