const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * Xcode 27+ (iOS 27 SDK) rejects Pod targets whose IPHONEOS_DEPLOYMENT_TARGET
 * is below 15.0 (e.g. RNCAsyncStorage_resources defaults to 13.4).
 * Clamp all Pod targets to at least 15.1 during pod install.
 */
const SNIPPET = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < 15.1
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`;

module.exports = function withIosDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) return modConfig;
      let podfile = fs.readFileSync(podfilePath, "utf8");
      if (podfile.includes("current.to_f < 15.1")) return modConfig;
      const anchor = "post_install do |installer|";
      if (podfile.includes(anchor)) {
        podfile = podfile.replace(anchor, `${anchor}\n${SNIPPET}`);
        fs.writeFileSync(podfilePath, podfile, "utf8");
      }
      return modConfig;
    },
  ]);
};
