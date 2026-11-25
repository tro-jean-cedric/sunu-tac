import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '../shared/theme';
import { SpeechProvider } from '../shared/speech';
import { App } from './App';
import './print.css';
import './fun.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <SpeechProvider>
        <App />
      </SpeechProvider>
    </AppProviders>
  </StrictMode>,
);
