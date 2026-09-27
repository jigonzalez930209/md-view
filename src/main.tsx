import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadPreferences, themeFor } from './lib/prefs';
import { applyAppearance, systemTheme } from './lib/theme';
import './styles/index.css';

// La apariencia se aplica antes del primer render para que no haya destello.
const preferences = loadPreferences();
applyAppearance(themeFor(preferences, systemTheme()), preferences.palette);

const container = document.getElementById('root');
if (!container) throw new Error('Falta el contenedor #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
