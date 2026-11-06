import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
// Fuente incluida en el panel: funciona aunque la oficina no tenga internet.
import '@fontsource-variable/archivo/wdth.css';
import './estilos.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
