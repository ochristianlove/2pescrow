const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const valtioForAppKit = path.join(
  projectRoot,
  "../../node_modules/@reown/appkit-core-react-native/node_modules/valtio/package.json",
);

const config = getDefaultConfig(projectRoot);

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
