import { TranslatedText } from "./lib/language";
import { Layout } from "./components/Layout";
import { Router, useRouter, normalizePathname } from "./lib/router";
import { HomePage } from "./pages/Home";
import { TradesPage } from "./pages/Trades";
import { CreateTradePage } from "./pages/CreateTrade";
import { TradeDetailPage } from "./pages/TradeDetail";
import { AdminPage } from "./pages/Admin";
import { AdminLoginPage } from "./pages/AdminLogin";
import { SignInPage } from "./pages/SignIn";
import { VerifyMagicLinkPage } from "./pages/VerifyMagicLink";
import { DashboardPage } from "./pages/Dashboard";
import { ProfilePage } from "./pages/ProfilePage";
import { ReferralProgramPage } from "./pages/ReferralProgram";
import { ReferralLandingPage } from "./pages/ReferralLanding";
import { ConnectWalletPage } from "./pages/ConnectWallet";
import { FeedbackPage } from "./pages/Feedback";
import { JoinTradePage } from "./pages/JoinTrade";
import { VerifyTradeRecordPage } from "./pages/VerifyTradeRecord";
import { TermsPage } from "./pages/Terms";
import { PrivacyPage } from "./pages/Privacy";
import { FaqPage } from "./pages/Faq";
import { BlogPage, BlogPostPage } from "./pages/Blog";

function Routes() {
  const { path: rawPath, navigate } = useRouter();
  const path = normalizePathname(rawPath);

  if (path === "/") return <HomePage />;
  if (path === "/signin") return <SignInPage />;
  if (path === "/connect-wallet") return <ConnectWalletPage />;
  if (path === "/auth/verify") return <VerifyMagicLinkPage />;
  if (path === "/app") return <DashboardPage />;
  if (path === "/app/profile") return <ProfilePage />;
  if (path === "/referrals") return <ReferralProgramPage />;
  if (path === "/feedback") return <FeedbackPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/faq") return <FaqPage />;
  if (path === "/blog") return <BlogPage />;
  if (path === "/trades") return <TradesPage />;
  if (path === "/trades/new") return <CreateTradePage />;
  if (path === "/join") return <JoinTradePage />;
  if (path === "/sys/login") return <AdminLoginPage />;
  if (path === "/admin") return <AdminPage />;

  const note = path.match(/^\/blog\/([^/]+)\/?$/);
  if (note) return <BlogPostPage slug={decodeURIComponent(note[1])} />;

  const detail = path.match(/^\/trades\/([^/]+)\/?$/);
  if (detail) return <TradeDetailPage id={detail[1]} />;

  const refLand = path.match(/^\/r\/([^/]+)\/?$/);
  if (refLand) return <ReferralLandingPage code={refLand[1]} />;

  if (/^\/verify\/[^/]+\/?$/.test(path)) return <VerifyTradeRecordPage />;

  return (
    <div className="page">
      <h1><TranslatedText text={"Page not found"} /></h1>
      <p className="muted"><TranslatedText text={"No route for"} /> {path}</p>
      <button type="button" onClick={() => navigate("/")}> <TranslatedText text={"Go home"} /> </button>
    </div>
  );
}

export default function App() {
  return (      <Router>
        <Layout>
          <Routes />
        </Layout>
      </Router>  );
}
