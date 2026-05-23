import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
createRoot(root).render(
  <StrictMode>
    <div>Vernon Dashboard — scaffolding</div>
  </StrictMode>,
);
