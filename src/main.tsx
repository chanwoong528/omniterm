import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAppearanceStore } from './stores/appearanceStore'
import { applyAppearanceMode } from './domains/appearance/utils/applyAppearanceMode'

// Before the first paint, not in an effect: an effect runs after paint, which
// would flash the dark shell for a light-mode user on every launch.
applyAppearanceMode(useAppearanceStore.getState().mode)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
