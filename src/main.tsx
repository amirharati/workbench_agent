import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/global.css'
import { applyAppTheme, readAppTheme } from './lib/theme.ts'

// The stored preference belongs to the dashboard. The narrow side-panel surface
// intentionally follows the browser/OS theme so it feels native beside a web page.
if (window.innerWidth >= 500) {
  applyAppTheme(readAppTheme())
} else {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = 'light dark'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
