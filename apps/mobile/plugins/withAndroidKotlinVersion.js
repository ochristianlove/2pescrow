const { withGradleProperties } = require("@expo/config-plugins");

// Expo 52's Compose compiler 1.5.15 requires Kotlin 1.9.25.
// Keep this in prebuild configuration so clean EAS builds match local builds.
module.exports = function withAndroidKotlinVersion(config) {
  return withGradleProperties(config, config => {
    config.modResults = config.modResults.filter(
      item => item.type !== "property" || item.key !== "android.kotlinVersion",
    );
    config.modResults.push({ type: "property", key: "android.kotlinVersion", value: "1.9.25" });
    return config;
  });
};
