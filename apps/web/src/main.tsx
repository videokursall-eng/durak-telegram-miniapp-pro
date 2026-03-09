import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Unregister any existing service worker and clear caches so old /api/* bundle never runs.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {})
    }
  })
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k).catch(() => {}))
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <App />
)
