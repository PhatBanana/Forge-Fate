import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { UpdatePrompt } from './components/UpdatePrompt.tsx'
import { ROSTER_KEY } from './storage.ts'

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
