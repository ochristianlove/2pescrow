import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

export function PageWash() {
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (mounted) setMotion(!reduce);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (reduce) => setMotion(!reduce));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: 1, backgroundColor: "#0c1a24" }} />
      <View style={{ flex: 1, backgroundColor: "#071018" }} />
      <View style={{ flex: 1, backgroundColor: "#050c12" }} />
      <Drift motion={motion} style={styles.washTeal} dx={16} dy={10} duration={8000} />
      <Drift motion={motion} style={styles.washGreen} dx={-12} dy={14} duration={9800} />
    </View>
  );
}

function Drift({
  motion,
  style,
  dx,
  dy,
  duration,
}: {
  motion: boolean;
  style: object;
  dx: number;
  dy: number;
  duration: number;
}) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, duration, motion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  washTeal: {
    position: "absolute",
    width: 280,
    height: 180,
    borderRadius: 140,
    backgroundColor: "rgba(46, 184, 200, 0.18)",
    top: -40,
    right: -60,
  },
  washGreen: {
    position: "absolute",
    width: 240,
    height: 160,
    borderRadius: 120,
    backgroundColor: "rgba(62, 207, 142, 0.12)",
    top: 80,
    left: -80,
  },
});
