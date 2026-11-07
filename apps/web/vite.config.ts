import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(dir, "../.."), "");
  const apiProxy = (env.VITE_API_URL || "http://localhost:3002").replace(/\/$/, "");

  return {
    envDir: path.resolve(dir, "../.."),
    plugins: [react()],
    resolve: {
      alias: {
        "@2pescrow/shared": path.resolve(dir, "../../packages/shared/src/index.ts"),
        // WalletConnect Core keeps a global singleton keyed by a shared default.
        // Pin all connectors to the TRON-compatible Core so an older EVM Core
        // cannot be reused by the newer TRON SignClient at runtime.
        "@walletconnect/core": path.resolve(dir, "node_modules/@walletconnect/core"),
      },
      // TRON WalletConnect currently ships AppKit 1.8.x beside the EVM wallet
      // connector's 1.7.x dependency. Keep each AppKit version paired with its
      // own controllers/UI packages so Vite doesn't resolve 1.8's `/features`
      // import against the older 1.7 package exports.
      dedupe: ["valtio"],
    },
    server: {
      port: 3003,
      proxy: {
        "/v1": { target: apiProxy, changeOrigin: true, ws: true },
        "/health": { target: apiProxy, changeOrigin: true },
      },
    },
  };
});
