// Expo 52's embedded Android bundle resolves its relative entry from the app,
// while the default monorepo server root points two directories above it.
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = "1";
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const valtioForAppKit = path.join(
  projectRoot,
  "../../node_modules/@reown/appkit-core-react-native/node_modules/valtio/package.json",
);

const config = getDefaultConfig(projectRoot);
// Shared translations and hoisted dependencies live outside the app root.
config.watchFolders = [...new Set([...config.watchFolders, path.resolve(projectRoot, "../..")])];

// AppKit packages each ship a separate valtio 2.1.8. A proxy created by one
// copy is invisible to subscribeKey from the other, which throws
// "Cannot convert undefined value to object" while the app is starting.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromAppKit = context.originModulePath.includes(`${path.sep}@reown${path.sep}`);
  if (fromAppKit && (moduleName === "valtio" || moduleName.startsWith("valtio/"))) {
    return context.resolveRequest(
      { ...context, originModulePath: valtioForAppKit },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
