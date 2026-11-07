import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';
import './operator.css';
import { OperatorApp } from './OperatorApp';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <OperatorApp />
  </StrictMode>,
);
