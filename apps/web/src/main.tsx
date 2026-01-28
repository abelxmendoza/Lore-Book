// BRUTAL BOOT TEST - This MUST execute if entry script loads
// CRITICAL: This must be the FIRST thing that runs - before any imports
// If this doesn't execute, the bundle failed to load or there's a syntax error
(function() {
  'use strict';
  try {
    // Use console.error which is NOT stripped in production builds
    console.error('[BOOT] main.tsx executing');
    // Also write directly to DOM to ensure visibility even if console is disabled
    try {
      const bootMarker = document.createElement('div');
      bootMarker.id = 'lorekeeper-boot-marker';
      bootMarker.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      bootMarker.setAttribute('data-boot-time', Date.now().toString());
      document.body.appendChild(bootMarker);
    } catch (e) { /* DOM may not be ready */ }
    // Store boot log in localStorage for production debugging (since debug endpoint isn't accessible)
    try {
      const bootLog = { location: 'main.tsx:2', message: 'main.tsx executing', timestamp: Date.now() };
      localStorage.setItem('lorekeeper_debug_boot', JSON.stringify(bootLog));
    } catch (e) { /* localStorage may not be available */ }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:2',message:'main.tsx executing',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    // If even the boot test fails, show error immediately
    console.error('[BOOT ERROR] Failed to execute boot test:', error);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
          <h1 style="color: #ef4444;">🚨 Critical Boot Error</h1>
          <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">main.tsx failed to execute</p>
          <pre style="text-align: left; background: rgba(255,0,0,0.2); padding: 15px; border-radius: 4px; overflow: auto; max-width: 800px; margin: 0 auto; color: #fca5a5;">${error instanceof Error ? error.stack : String(error)}</pre>
        </div>
      `;
    }
    throw error; // Re-throw to prevent further execution
  }
})();

// Global error handlers for production black screen detection
// CRITICAL: These must be set up BEFORE any imports to catch early errors
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.error, event.message, event.filename, event.lineno);
  // Store error in localStorage for production debugging
  try {
    const errorLog = {
      location: 'main.tsx:global-error',
      message: 'Global error caught',
      data: {
        errorMessage: event.message,
        errorStack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };
    localStorage.setItem('lorekeeper_debug_error', JSON.stringify(errorLog));
  } catch (e) { /* localStorage may not be available */ }
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:global-error',message:'Global error caught',data:{errorMessage:event.message,errorStack:event.error?.stack,filename:event.filename,lineno:event.lineno,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  // Show error on page if React hasn't rendered yet - CRITICAL for production debugging
  const root = document.getElementById('root');
  if (root) {
    const hasChildren = root.hasChildNodes();
    if (!hasChildren) {
      const errorHtml = `
        <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
          <h1 style="color: #ef4444;">🚨 JavaScript Error</h1>
          <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">${event.message || 'Unknown error'}</p>
          <pre style="text-align: left; background: rgba(255,0,0,0.2); padding: 15px; border-radius: 4px; overflow: auto; max-width: 800px; margin: 0 auto; color: #fca5a5;">${event.error?.stack || event.message || 'No stack trace available'}</pre>
          <p style="margin-top: 20px; color: #94a3b8; font-size: 14px;">File: ${event.filename || 'unknown'} | Line: ${event.lineno || 'unknown'}</p>
          <p style="margin-top: 10px; color: #64748b; font-size: 12px;">Check browser console (F12) for more details</p>
        </div>
      `;
      root.innerHTML = errorHtml;
    }
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[GLOBAL UNHANDLED REJECTION]', event.reason);
  // Store error in localStorage for production debugging
  try {
    const rejectionLog = {
      location: 'main.tsx:unhandled-rejection',
      message: 'Unhandled promise rejection',
      data: {
        reason: String(event.reason),
        errorStack: event.reason?.stack,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };
    localStorage.setItem('lorekeeper_debug_rejection', JSON.stringify(rejectionLog));
  } catch (e) { /* localStorage may not be available */ }
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:unhandled-rejection',message:'Unhandled promise rejection',data:{reason:String(event.reason),errorStack:event.reason?.stack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  // Show error on page for unhandled rejections too
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    const errorHtml = `
      <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
        <h1 style="color: #ef4444;">🚨 Unhandled Promise Rejection</h1>
        <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">${String(event.reason) || 'Unknown rejection'}</p>
        <pre style="text-align: left; background: rgba(255,0,0,0.2); padding: 15px; border-radius: 4px; overflow: auto; max-width: 800px; margin: 0 auto; color: #fca5a5;">${event.reason?.stack || String(event.reason) || 'No stack trace available'}</pre>
        <p style="margin-top: 20px; color: #64748b; font-size: 12px;">Check browser console (F12) for more details</p>
      </div>
    `;
    root.innerHTML = errorHtml;
  }
});

// Check if React rendered but is invisible (CSS issue)
setTimeout(() => {
  const root = document.getElementById('root');
  if (root) {
    const hasChildren = root.hasChildNodes();
    const computedStyle = window.getComputedStyle(root);
    const isVisible = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden' && computedStyle.opacity !== '0';
    const hasHeight = root.offsetHeight > 0;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:visibility-check',message:'React rendering visibility check',data:{hasChildren,isVisible,hasHeight,display:computedStyle.display,visibility:computedStyle.visibility,opacity:computedStyle.opacity,offsetHeight:root.offsetHeight,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (hasChildren && !isVisible) {
      console.error('[VISIBILITY ERROR] React rendered but root element is invisible!', { computedStyle, offsetHeight: root.offsetHeight });
      // Show error on page
      const errorHtml = `
        <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
          <h1 style="color: #fbbf24;">⚠️ Visibility Error</h1>
          <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">React rendered but root element is invisible!</p>
          <pre style="text-align: left; background: rgba(255,165,0,0.2); padding: 15px; border-radius: 4px; overflow: auto; max-width: 800px; margin: 0 auto; color: #fde047;">Display: ${computedStyle.display}\nVisibility: ${computedStyle.visibility}\nOpacity: ${computedStyle.opacity}\nHeight: ${root.offsetHeight}px</pre>
        </div>
      `;
      root.innerHTML = errorHtml;
    }
    if (hasChildren && !hasHeight) {
      console.error('[HEIGHT ERROR] React rendered but root element has no height!', { computedStyle, offsetHeight: root.offsetHeight });
      // Show error on page
      const errorHtml = `
        <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
          <h1 style="color: #fbbf24;">⚠️ Height Error</h1>
          <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">React rendered but root element has no height!</p>
          <pre style="text-align: left; background: rgba(255,165,0,0.2); padding: 15px; border-radius: 4px; overflow: auto; max-width: 800px; margin: 0 auto; color: #fde047;">Height: ${root.offsetHeight}px\nDisplay: ${computedStyle.display}</pre>
        </div>
      `;
      root.innerHTML = errorHtml;
    }
    // If no children after 3 seconds, show loading/error message
    if (!hasChildren) {
      console.error('[RENDER ERROR] React did not render any children after 3 seconds!');
      const errorHtml = `
        <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
          <h1 style="color: #ef4444;">🚨 Render Timeout</h1>
          <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">React did not render any children after 3 seconds</p>
          <p style="margin-top: 20px; color: #94a3b8; font-size: 14px;">This usually indicates:</p>
          <ul style="text-align: left; max-width: 600px; margin: 20px auto; color: #cbd5e1;">
            <li>A JavaScript error preventing React from mounting</li>
            <li>An infinite loading state</li>
            <li>A build/bundle loading issue</li>
          </ul>
          <p style="margin-top: 20px; color: #64748b; font-size: 12px;">Check browser console (F12) for errors</p>
        </div>
      `;
      root.innerHTML = errorHtml;
    }
  }
}, 3000);

import './styles/tailwind.css';
import './styles/timeline.css';

// Verify CSS loaded (check for Tailwind classes)
setTimeout(() => {
  const testEl = document.createElement('div');
  testEl.className = 'bg-black text-white';
  document.body.appendChild(testEl);
  const computedStyle = window.getComputedStyle(testEl);
  const hasStyles = computedStyle.backgroundColor !== '' || computedStyle.color !== '';
  document.body.removeChild(testEl);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:css-check',message:'CSS loading verification',data:{hasStyles,backgroundColor:computedStyle.backgroundColor,color:computedStyle.color,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  if (!hasStyles) {
    console.error('[CSS ERROR] Tailwind CSS may not be loaded!');
  }
}, 1000);

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
import { CurrentContextProvider } from './contexts/CurrentContextContext';
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

// Verify API configuration (critical for production)
// #region agent log
fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:env-check',message:'Environment configuration check',data:{isDevelopment:config.env.isDevelopment,isProduction:config.env.isProduction,apiUrl:config.api.url,hasApiUrl:!!config.api.url,allowMockData:config.dev.allowMockData,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'F'})}).catch(()=>{});
// #endregion
if (config.env.isProduction && !config.api.url && !config.dev.allowMockData) {
  console.error('[CONFIG ERROR] Production mode requires API URL or mock data!');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:config-error',message:'Configuration error - missing API URL in production',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
}

// Initialize mock data service
// Wrap in try-catch and store error in localStorage
try {
  mockDataService.initialize().catch((error) => {
    console.error('[Main] Failed to initialize mock data service:', error);
    try {
      const errorLog = { location: 'main.tsx:mock-init', message: 'Mock data service initialization failed', data: { error: String(error), timestamp: Date.now() }, timestamp: Date.now() };
      localStorage.setItem('lorekeeper_debug_mock_init_error', JSON.stringify(errorLog));
    } catch (e) { /* localStorage may not be available */ }
  });
} catch (error) {
  console.error('[Main] Failed to call mockDataService.initialize:', error);
  try {
    const errorLog = { location: 'main.tsx:mock-init-call', message: 'Failed to call mockDataService.initialize', data: { error: String(error), timestamp: Date.now() }, timestamp: Date.now() };
    localStorage.setItem('lorekeeper_debug_mock_init_call_error', JSON.stringify(errorLog));
  } catch (e) { /* localStorage may not be available */ }
}

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
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <MockDataProvider>
              <GuestProvider>
                <EntityModalProvider>
                  <CurrentContextProvider>
                    <DevelopmentNotice />
                    <Router />
                    <DevBanner />
                    <MockDataIndicator />
                  </CurrentContextProvider>
                </EntityModalProvider>
              </GuestProvider>
            </MockDataProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>
    );
    console.error('[Main] React app mounted successfully'); // Use console.error so it's not stripped in production
    // Store success log in localStorage
    try {
      const mountLog = { location: 'main.tsx:76', message: 'React app mounted successfully', timestamp: Date.now() };
      localStorage.setItem('lorekeeper_debug_mount', JSON.stringify(mountLog));
    } catch (e) { /* localStorage may not be available */ }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:76',message:'React app mounted successfully',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    console.error('[Main] Failed to mount React app:', error);
    // Store error in localStorage
    try {
      const errorLog = {
        location: 'main.tsx:mount-error',
        message: 'React app mount failed - CRITICAL ERROR',
        data: {
          error: String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
      localStorage.setItem('lorekeeper_debug_mount_error', JSON.stringify(errorLog));
    } catch (e) { /* localStorage may not be available */ }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:78',message:'React app mount failed - CRITICAL ERROR',data:{error:String(error),errorStack:error instanceof Error?error.stack:undefined,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    rootElement.innerHTML = `
      <div style="padding: 20px; color: white; text-align: center; background: black; min-height: 100vh; font-family: monospace;">
        <h1 style="color: #ef4444;">🚨 Application Error</h1>
        <p style="color: #fbbf24; font-size: 18px; margin: 20px 0;">Failed to initialize the application.</p>
        <pre style="text-align: left; background: rgba(255,0,0,0.2); padding: 15px; border-radius: 4px; overflow: auto; max-width: 800px; margin: 0 auto; color: #fca5a5;">${error instanceof Error ? error.stack : String(error)}</pre>
        <p style="margin-top: 20px; color: #64748b; font-size: 12px;">Check browser console (F12) for more details</p>
      </div>
    `;
  }
}
