const { withAppBuildGradle } = require("@expo/config-plugins");

const marker = "// 2Pescrow: bundle JavaScript into sideloaded debug APKs.";
function embedAndroidBundle(contents) {
  if (contents.includes(marker)) return contents;
  if (!/react\s*\{/.test(contents)) throw new Error("Expected the React Native Gradle configuration.");
  // Preserve the same settings when applying this plugin to an existing local project.
  const existing = /^[ \t]*(?:root = file\(projectRoot\)|debuggableVariants = \[\]|extraPackagerArgs = \["--max-workers", "1"\])\r?\n/gm;
  return contents.replace(existing, "").replace(/react\s*\{/, `react {
    ${marker}
    root = file(projectRoot)
    debuggableVariants = []
    extraPackagerArgs = ["--max-workers", "1"]`);
}

module.exports = function withEmbeddedAndroidBundle(config) {
  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== "groovy") throw new Error("The Android bundle plugin requires Groovy Gradle.");
    config.modResults.contents = embedAndroidBundle(config.modResults.contents);
    return config;
  });
};
module.exports.embedAndroidBundle = embedAndroidBundle;
