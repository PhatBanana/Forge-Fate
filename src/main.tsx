import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { UpdatePrompt } from './components/UpdatePrompt.tsx'
import { ROSTER_KEY } from './storage.ts'
import { flush, hydrate } from './persist.ts'

/*
  Storage is read once, here, before anything renders.

  Everything downstream reads its store synchronously - `useState(loadRoster)`
  and a hundred others - which is only true because the cache is already full
  by the time the tree is built. This is the single await that buys all of
  them. It never rejects: `hydrate` falls back to localStorage, then to
  memory, because an app that will not start is worse than one that will not
  remember.
*/
await hydrate()

/*
  A page being closed may be holding writes that have not been carried across
  yet - the flush coalesces bursts by design. `pagehide` is the event that
  actually fires on mobile, where `beforeunload` does not.
*/
window.addEventListener('pagehide', () => void flush())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush()
})

// The boundary wraps `App` rather than living inside it: a boundary cannot
// catch a throw from its own component, and `App` is where the roster is read.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary rosterKey={ROSTER_KEY}>
      <App />
    </ErrorBoundary>
    {/*
      Outside the boundary on purpose. If a saved character will not render,
      the offer of a new version is the most useful thing on the screen - it
      may well be the fix - so it must not be inside the thing that broke.
    */}
    <UpdatePrompt />
  </StrictMode>,
)
