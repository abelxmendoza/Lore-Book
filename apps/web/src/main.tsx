// BRUTAL BOOT TEST - This MUST execute if entry script loads
console.log('[BOOT] main.tsx executing');
// #region agent log
fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:2',message:'main.tsx executing',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
// #endregion

import './styles/tailwind.css';
import './styles/timeline.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { Router } from './pages/Router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevBanner } from './components/DevBanner';
import { DevelopmentNotice } from './components/DevelopmentNotice';
import { MockDataIndicator } from './components/MockDataIndicator';
import { GuestProvider } from './contexts/GuestContext';
import { EntityModalProvider } from './contexts/EntityModalContext';
import { MockDataProvider } from './contexts/MockDataContext';
import { mockDataService } from './services/mockDataService';
import { config, log } from './config/env';
import { initMonitoring } from './lib/monitoring';

// Initialize monitoring (error tracking, analytics, performance)
// Wrap in try-catch to prevent blocking app initialization
try {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:27',message:'Initializing monitoring',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  initMonitoring();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:30',message:'Monitoring initialized successfully',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
} catch (error) {
  console.error('[Main] Failed to initialize monitoring:', error);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:32',message:'Monitoring initialization failed',data:{error:String(error),timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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

// Initialize mock data service
mockDataService.initialize().catch((error) => {
  console.error('[Main] Failed to initialize mock data service:', error);
});

// Import mock data utilities (exposes console helpers)
import './utils/enableMockData';

// Ensure root element exists
const rootElement = document.getElementById('root');
// #region agent log
fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:52',message:'Checking root element',data:{rootElementExists:!!rootElement,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
// #endregion
if (!rootElement) {
  console.error('[Main] Root element not found!');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:54',message:'Root element not found - CRITICAL ERROR',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  document.body.innerHTML = '<div style="padding: 20px; color: white; text-align: center;"><h1>Error</h1><p>Root element not found. Please check the HTML structure.</p></div>';
} else {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:58',message:'Attempting to render React app',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <MockDataProvider>
              <GuestProvider>
                <EntityModalProvider>
                  <DevelopmentNotice />
                  <Router />
                  <DevBanner />
                  <MockDataIndicator />
                </EntityModalProvider>
              </GuestProvider>
            </MockDataProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>
    );
    console.log('[Main] React app mounted successfully');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:76',message:'React app mounted successfully',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    console.error('[Main] Failed to mount React app:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:78',message:'React app mount failed - CRITICAL ERROR',data:{error:String(error),errorStack:error instanceof Error?error.stack:undefined,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    rootElement.innerHTML = `
      <div style="padding: 20px; color: white; text-align: center;">
        <h1>Application Error</h1>
        <p>Failed to initialize the application.</p>
        <pre style="text-align: left; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 4px; overflow: auto;">${error instanceof Error ? error.stack : String(error)}</pre>
      </div>
    `;
  }
}
