import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, getInitialTheme } from './lib/theme';
import './styles/index.css';

// El tema se aplica antes del primer render para que no haya destello blanco.
applyTheme(getInitialTheme());

const container = document.getElementById('root');
if (!container) throw new Error('Falta el contenedor #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
