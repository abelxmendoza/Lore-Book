import './styles/tailwind.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { Router } from './pages/Router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevBanner } from './components/DevBanner';
import { DevelopmentNotice } from './components/DevelopmentNotice';
import { config, log } from './config/env';

// Log environment info in development
if (config.isDevelopment) {
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
        <DevelopmentNotice />
        <Router />
        <DevBanner />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
