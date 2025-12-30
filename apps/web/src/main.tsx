import './styles/tailwind.css';
import './styles/timeline.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { Router } from './pages/Router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevBanner } from './components/DevBanner';
import { DevelopmentNotice } from './components/DevelopmentNotice';
import { GuestProvider } from './contexts/GuestContext';
import { EntityModalProvider } from './contexts/EntityModalContext';
import { config, log } from './config/env';
import { initMonitoring } from './lib/monitoring';

// Initialize monitoring (error tracking, analytics, performance)
initMonitoring();

// Log environment info in development
if (config.env.isDevelopment) {
  log.info('Application starting in development mode');
  log.debug('Environment configuration:', {
    mode: config.env.mode,
    apiUrl: config.api.url,
    allowMockData: config.dev.allowMockData,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <GuestProvider>
          <EntityModalProvider>
          <DevelopmentNotice />
          <Router />
          <DevBanner />
          </EntityModalProvider>
        </GuestProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
