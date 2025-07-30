import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { TonConnectUIProvider } from '@tonconnect/ui-react';

// URL манифеста для продакшена
const manifestUrl = 'https://testsabc.top/tonconnect-manifest.json';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider 
      manifestUrl={manifestUrl}
      actionsConfiguration={{
        twaReturnUrl: 'https://t.me/TeleRoll_bot'
      }}
    >
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>, 
)
