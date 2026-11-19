import { useAuth } from "../src/auth";
import { IntroHome } from "../src/IntroHome";
import { LogoLoader } from "../src/LogoLoader";

export default function Index() {
  const { ready } = useAuth();
  if (!ready) {
    return <LogoLoader fullScreen message="Loading 2Pescrow…" />;
  }
  return <IntroHome />;
}
