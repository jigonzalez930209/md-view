import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setActiveLanguage } from './lib/i18n';
import { loadPreferences, themeFor } from './lib/prefs';
import { applyAppearance, systemTheme } from './lib/theme';
import { syncWindowBackground } from './lib/backend';
import './styles/index.css';

// Appearance and language are applied before the first render so there's no flash.
const preferences = loadPreferences();
setActiveLanguage(preferences.language);
applyAppearance(themeFor(preferences, systemTheme()), preferences.palette);
void syncWindowBackground();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root container');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
