const { withAndroidManifest, createRunOncePlugin } = require("expo/config-plugins");

const queries = {
  package: [
    { $: { "android:name": "io.metamask" } },
    { $: { "android:name": "com.wallet.crypto.trustapp" } },
    { $: { "android:name": "me.rainbow" } },
    { $: { "android:name": "io.gnosis.safe" } },
  ],
};

const withWalletQueries = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults.manifest = {
      ...config.modResults.manifest,
      queries,
    };
    return config;
  });

module.exports = createRunOncePlugin(withWalletQueries, "withWalletQueries", "1.0.0");
