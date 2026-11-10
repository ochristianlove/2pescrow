import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { api } from "./api";
import { webOrigin } from "./config";

const logo = require("../assets/logo.png");
const factoryFallback = "0x08Be929Ac784E8aEe20403c4F5bbEE2668e183c9";

type Settings = {
  factoryAddress?: string | null;
  telegramUrl?: string | null;
  xUrl?: string | null;
  discordUrl?: string | null;
};

export function HomeFooter() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Settings>("/v1/settings")
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const origin = webOrigin();
  const factory = settings?.factoryAddress?.trim() || factoryFallback;
  const socials = [
    { label: "Telegram", href: settings?.telegramUrl?.trim() || "https://t.me/" },
    { label: "X", href: settings?.xUrl?.trim() || "https://x.com/" },
    { label: "Discord", href: settings?.discordUrl?.trim() || "https://discord.com/" },
  ];

  return (
    <View style={styles.footer}>
      <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="2Pescrow" />
      <Text style={styles.blurb}>
        2Pescrow is Web3 peer-to-peer escrow. Two people trade directly, and the payment stays in a smart contract until the deal is done.
      </Text>
      <View style={styles.socials}>
        {socials.map((item) => (
          <Pressable key={item.label} accessibilityRole="link" onPress={() => void Linking.openURL(item.href)} style={styles.social}>
            <Text style={styles.socialLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.heading}>Trade</Text>
      <FooterLink label="Start a trade" onPress={() => router.push("/sign-in")} />
      <FooterLink label="Join a trade" onPress={() => router.push("/sign-in")} />
      <FooterLink label="Open trades" onPress={() => router.push("/(app)/ledger")} />
      <FooterLink label="Referrals" onPress={() => void Linking.openURL(`${origin}/referrals`)} />
      <FooterLink label="FAQ" onPress={() => void Linking.openURL(`${origin}/faq`)} />

      <Text style={styles.heading}>Read</Text>
      <FooterLink label="Blog" onPress={() => void Linking.openURL(`${origin}/blog`)} />
      <FooterLink label="Etherscan" onPress={() => void Linking.openURL(`https://etherscan.io/address/${factory}`)} />
      <FooterLink label="Terms" onPress={() => void Linking.openURL(`${origin}/terms`)} />
      <FooterLink label="Privacy" onPress={() => void Linking.openURL(`${origin}/privacy`)} />

      <Text style={styles.legal}>
        Payments go from the buyer's wallet into an escrow smart contract. 2Pescrow does not hold them. A dispute is settled only by the rules in that contract. 2Pescrow is not a bank.{" "}
        <Text style={styles.legalLink} onPress={() => void Linking.openURL(`${origin}/terms`)}>
          Read the Terms.
        </Text>
      </Text>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.linkHit}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: 28,
    paddingTop: 22,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#1f3440",
  },
  logo: { height: 40, width: 180, marginBottom: 12 },
  blurb: { color: "#8aa3ad", fontSize: 14, lineHeight: 22, marginBottom: 14 },
  socials: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  social: {
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "rgba(14, 28, 38, 0.7)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  socialLabel: { color: "#e8f4f2", fontSize: 13, fontWeight: "600" },
  heading: {
    color: "#3ecf8e",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 4,
  },
  linkHit: { paddingVertical: 5 },
  link: { color: "#e8f4f2", fontSize: 15 },
  legal: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#1f3440",
    color: "#8aa3ad",
    fontSize: 13,
    lineHeight: 20,
  },
  legalLink: { color: "#8aa3ad", textDecorationLine: "underline" },
});
