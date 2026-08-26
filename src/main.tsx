import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './styles/global.css'
import { applyAppTheme, readAppTheme } from './lib/theme.ts'
import { isSidePanelSurface } from './lib/appSurface.ts'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'

// The stored preference belongs to the dashboard. The narrow side-panel surface
// intentionally follows the browser/OS theme so it feels native beside a web page.
const sidePanelSurface = isSidePanelSurface()

if (sidePanelSurface) {
  document.documentElement.dataset.surface = 'side-panel'
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = 'light dark'
} else {
  document.documentElement.dataset.surface = 'dashboard'
  applyAppTheme(readAppTheme())
}

const surfaceModule = sidePanelSurface
  ? import('./SidePanelApp.tsx')
  : import('./App.tsx')

const rootElement = document.getElementById('root')
const root = rootElement ? ReactDOM.createRoot(rootElement) : null

void surfaceModule.then(({ default: SurfaceApp }) => {
  root?.render(
    <React.StrictMode>
      <AppErrorBoundary context={sidePanelSurface ? 'the side panel' : 'Homebase'}>
        <SurfaceApp />
      </AppErrorBoundary>
    </React.StrictMode>,
  )
}).catch((error: unknown) => {
  console.error('[Homebase] Initial application module failed to load', error)
  const message = error instanceof Error ? error.message : String(error)
  root?.render(
    <div className="ui-bootstrap-error" role="alert">
      <strong>Homebase could not load</strong>
      <p>The extension may have been updated while this page was open. Reload to use the current files.</p>
      <code>{message}</code>
      <button type="button" onClick={() => window.location.reload()}>Reload page</button>
    </div>,
  )
})
