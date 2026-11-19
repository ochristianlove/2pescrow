import { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";
import { Text } from "./language";
import { colors } from "./theme";

const logo = require("../assets/logo.png");

export function LogoLoader({
  message,
  size = "normal",
  fullScreen = false,
}: {
  message?: string;
  size?: "small" | "normal" | "large";
  fullScreen?: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.04],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 1],
  });

  const logoWidth = size === "small" ? 120 : size === "large" ? 220 : 160;
  const logoHeight = logoWidth * (32 / 128); // 4:1 aspect ratio

  const content = (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Image
          source={logo}
          style={{ width: logoWidth, height: logoHeight }}
          resizeMode="contain"
          accessibilityLabel="2Pescrow loading"
        />
      </Animated.View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );

  if (fullScreen) {
    return <View style={styles.fullScreen}>{content}</View>;
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 14,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
