// BRUTAL BOOT TEST - This MUST execute if entry script loads
console.log('[BOOT] main.tsx executing');
document.body.innerHTML = '<h1 style="color:red;padding:20px;background:black;text-align:center;font-size:24px;">BOOT EXECUTED - Entry script is running</h1>';

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
// Wrap in try-catch to prevent blocking app initialization
try {
  initMonitoring();
} catch (error) {
  console.error('[Main] Failed to initialize monitoring:', error);
  // Continue with app initialization even if monitoring fails
}

// Log environment info in development
if (config.env.isDevelopment) {
  log.info('Application starting in development mode');
  log.debug('Environment configuration:', {
    mode: config.env.mode,
    apiUrl: config.api.url,
    allowMockData: config.dev.allowMockData,
  });
}

// Ensure root element exists
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[Main] Root element not found!');
  document.body.innerHTML = '<div style="padding: 20px; color: white; text-align: center;"><h1>Error</h1><p>Root element not found. Please check the HTML structure.</p></div>';
} else {
  try {
    createRoot(rootElement).render(
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
    console.log('[Main] React app mounted successfully');
  } catch (error) {
    console.error('[Main] Failed to mount React app:', error);
    rootElement.innerHTML = `
      <div style="padding: 20px; color: white; text-align: center;">
        <h1>Application Error</h1>
        <p>Failed to initialize the application.</p>
        <pre style="text-align: left; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 4px; overflow: auto;">${error instanceof Error ? error.stack : String(error)}</pre>
      </div>
    `;
  }
}
