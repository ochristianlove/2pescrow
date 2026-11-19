import { ensureCryptoPolyfill } from "./lib/cryptoPolyfill";
ensureCryptoPolyfill();

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { LanguageProvider } from "./lib/language";
import { AuthProvider } from "./lib/auth";
import { PlatformSettingsProvider } from "./lib/platformSettings";
import { TronWalletProvider } from "./lib/tron/TronWalletContext";
import { EvmWalletPickerProvider } from "./lib/evmWalletPicker";
import { LiveNotificationsProvider } from "./lib/liveNotifications";
import { WalletConnectedFeedback } from "./lib/walletConnectedFeedback";
import { wagmiConfig } from "./wagmi";
import "./styles.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LiveNotificationsProvider>
            <PlatformSettingsProvider>
              <TronWalletProvider>
                <EvmWalletPickerProvider>
                  <WalletConnectedFeedback />
                  <App />
                </EvmWalletPickerProvider>
              </TronWalletProvider>
            </PlatformSettingsProvider>
          </LiveNotificationsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
    </LanguageProvider>
  </React.StrictMode>
);
