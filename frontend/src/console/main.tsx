import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfirmProvider, SettingsDrawer } from '@vionhub/design-system/components';

import { AppProviders } from '../shared/theme';
import { App } from './App';
import './brand.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <AppProviders>
        <SettingsDrawer hideNavColor />
        <ConfirmProvider
          defaultTexts={{ title: 'Confirmer', confirmText: 'Confirmer', cancelText: 'Annuler' }}
        >
          <App />
        </ConfirmProvider>
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
