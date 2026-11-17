import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applySavedThemeEarly } from './theme'

applySavedThemeEarly()
createRoot(document.getElementById('root')!).render(<App />)
