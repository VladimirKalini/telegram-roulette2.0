import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { TonConnectUIProvider } from '@tonconnect/ui-react';

// URL манифеста, который мы создали ранее
const manifestUrl = 'https://70d7adef08c1.ngrok-free.app/tonconnect-manifest.json';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Оборачиваем все приложение в провайдер */}
    <TonConnectUIProvider 
      manifestUrl={manifestUrl}
      walletsListConfiguration={{
        includeWallets: [
          {
            appName: "telegram-wallet",
            name: "Wallet",
            imageUrl: "https://wallet.tg/images/logo-288.png",
            aboutUrl: "https://wallet.tg/",
            universalLink: "https://t.me/wallet?attach=wallet",
            bridgeUrl: "https://bridge.tonapi.io/bridge",
            platforms: ["ios", "android", "macos", "windows", "linux"]
          }
        ]
      }}
      actionsConfiguration={{
        twaReturnUrl: 'https://t.me/TeleRoll_bot'
      }}
    >
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>, 
)
