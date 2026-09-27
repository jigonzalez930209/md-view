import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadPreferences, themeFor } from './lib/prefs';
import { applyAppearance, systemTheme } from './lib/theme';
import './styles/index.css';

// Appearance is applied before the first render so there's no flash.
const preferences = loadPreferences();
applyAppearance(themeFor(preferences, systemTheme()), preferences.palette);

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root container');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
