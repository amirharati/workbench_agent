import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './styles/global.css'
import { applyAppTheme, readAppTheme } from './lib/theme.ts'
import { isSidePanelSurface } from './lib/appSurface.ts'

// The stored preference belongs to the dashboard. The narrow side-panel surface
// intentionally follows the browser/OS theme so it feels native beside a web page.
if (isSidePanelSurface()) {
  document.documentElement.dataset.surface = 'side-panel'
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = 'light dark'
} else {
  document.documentElement.dataset.surface = 'dashboard'
  applyAppTheme(readAppTheme())
}

const surfaceModule = isSidePanelSurface()
  ? import('./SidePanelApp.tsx')
  : import('./App.tsx')

void surfaceModule.then(({ default: SurfaceApp }) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <SurfaceApp />
    </React.StrictMode>,
  )
})
