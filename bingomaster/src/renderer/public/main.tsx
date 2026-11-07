import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';
import './public.css';
import { PublicApp } from './PublicApp';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <PublicApp />
  </StrictMode>,
);
