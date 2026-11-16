import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth";
import { IntroHome } from "../src/IntroHome";
import { colors } from "../src/theme";

export default function Index() {
  const { ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return <IntroHome />;
}
