import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SessionProvider } from './store/session'
import { ToastProvider } from './components/ui'
// Side-effect import: attaches the beforeinstallprompt listener before React
// renders, so the event is never missed on the landing route.
import './lib/installPrompt'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Opt into the v7 behaviours now so the upgrade is a version bump
        rather than a migration. */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
