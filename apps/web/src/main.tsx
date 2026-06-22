// Global error handlers — must be first, before any imports, to catch early errors
const isExtensionErrorSource = (filename?: string): boolean => {
  if (!filename) return false;
  return /(?:chrome-extension|moz-extension|safari-extension|contentscript|content\.js|Worlds\.js|installHook\.js)/i.test(filename);
};

const isExtensionRejection = (reason: unknown): boolean => {
  if (!reason || typeof reason !== 'object') return false;
  const text = [
    String((reason as { message?: unknown }).message ?? ''),
    String((reason as { stack?: unknown }).stack ?? ''),
    String((reason as { filename?: unknown }).filename ?? ''),
  ].join(' ');
  return isExtensionErrorSource(text);
};

window.addEventListener('error', (event) => {
  if (isExtensionErrorSource(event.filename)) return;

  console.error('[LoreBook] Uncaught error', event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
  });
  // Show fallback UI if React hasn't mounted yet
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `
      <div style="padding:20px;color:white;text-align:center;background:black;min-height:100vh;font-family:monospace;">
        <h1 style="color:#ef4444;">Application Error</h1>
        <p style="color:#fbbf24;">${event.message || 'Unknown error'}</p>
        <pre style="text-align:left;background:rgba(255,0,0,0.2);padding:15px;border-radius:4px;overflow:auto;max-width:800px;margin:0 auto;color:#fca5a5;">${event.error?.stack || event.message || 'No stack trace'}</pre>
        <p style="margin-top:20px;color:#64748b;font-size:12px;">Open DevTools (F12) for more details</p>
      </div>
    `;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isExtensionRejection(event.reason)) return;

  const reason = String(event.reason ?? '');
  const isBackendDown =
    reason.includes('Backend unavailable') ||
    reason.includes('Backend server is not running') ||
    reason.includes('Failed to fetch') ||
    reason.includes('ERR_CONNECTION_REFUSED') ||
    reason.includes('NetworkError') ||
    reason.includes('network error');
  if (isBackendDown) {
    // Expected in dev with no backend running — already surfaced via BackendUnavailableBanner
    return;
  }
  console.error('[LoreBook] Unhandled promise rejection', event.reason);
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `
      <div style="padding:20px;color:white;text-align:center;background:black;min-height:100vh;font-family:monospace;">
        <h1 style="color:#ef4444;">Unhandled Promise Rejection</h1>
        <p style="color:#fbbf24;">${String(event.reason) || 'Unknown'}</p>
        <pre style="text-align:left;background:rgba(255,0,0,0.2);padding:15px;border-radius:4px;overflow:auto;max-width:800px;margin:0 auto;color:#fca5a5;">${event.reason?.stack || String(event.reason) || 'No stack trace'}</pre>
      </div>
    `;
  }
});

// Stale lazy-chunk recovery. After a redeploy, an old hashed chunk can 404 and
// the SPA serves index.html (text/html) instead of JS — surfacing as Vite's
// `vite:preloadError` (and "'text/html' is not a valid JavaScript MIME type").
// Reload once to pick up the new asset manifest instead of white-screening. The
// timestamped guard reloads at most once per 10s, so a genuinely-missing asset
// can't cause an infinite reload loop while future deploys still self-heal.
const PRELOAD_RELOAD_KEY = 'lk-preload-reloaded-at';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — fall through to a single reload attempt */
  }
  window.location.reload();
});

// After 3s, check that React actually rendered; show a diagnostic if it didn't
setTimeout(() => {
  const root = document.getElementById('root');
  if (!root) return;
  if (!root.hasChildNodes()) {
    console.error('[LoreBook] React did not render within 3s — check for JS errors above');
    root.innerHTML = `
      <div style="padding:20px;color:white;text-align:center;background:black;min-height:100vh;font-family:monospace;">
        <h1 style="color:#ef4444;">Render Timeout</h1>
        <p style="color:#fbbf24;">React did not render after 3 seconds.</p>
        <p style="margin-top:16px;color:#94a3b8;">Open DevTools (F12) and check the Console for errors.</p>
      </div>
    `;
  }
}, 3000);

import './styles/tailwind.css';
import './styles/timeline.css';

import { initSupabase } from './lib/supabase';

await initSupabase();

import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ReduxProvider } from './store/ReduxProvider';
import { ChatThreadProvider } from './contexts/ChatThreadContext';
import { LoreKeeperProvider } from './contexts/LoreKeeperContext';

import { Router } from './pages/Router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackendUnavailableBanner } from './components/BackendUnavailableBanner';
import { DatabaseOpsBanner } from './components/admin/DatabaseOpsBanner';
import { DevelopmentNotice } from './components/DevelopmentNotice';
import { MockDataIndicator } from './components/MockDataIndicator';
import { DemoMutationEffects } from './components/DemoMutationEffects';
import { CelebrationHost } from './components/celebrations/CelebrationHost';
import { GuestProvider } from './contexts/GuestContext';
import { EntityModalProvider } from './contexts/EntityModalContext';
import { CurrentContextProvider } from './contexts/CurrentContextContext';
import { SoulProfileChatProvider } from './contexts/SoulProfileChatContext';
import { MockDataProvider } from './contexts/MockDataContext';
import { LoreReadinessSimulationProvider } from './contexts/LoreReadinessSimulationContext';
import { mockDataService } from './services/mockDataService';
import { config } from './config/env';
import { initMonitoring } from './lib/monitoring';
import { runEnvironmentCheck } from './services/environmentIntegrity';

try {
  initMonitoring();
} catch (error) {
  console.error('[LoreBook] Monitoring init failed:', error);
}

if (config.env.isDevelopment) {
  console.debug('[LoreBook] Starting in development mode', {
    apiUrl: config.api.url || '(Vite proxy)',
    allowMockData: config.dev.allowMockData,
  });
}

runEnvironmentCheck();

mockDataService.initialize().catch((error) => {
  console.error('[LoreBook] Mock data service init failed:', error);
});

import './utils/enableMockData';

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[LoreBook] #root element not found');
} else {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <ReduxProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ChatThreadProvider>
          <MockDataProvider>
            <LoreReadinessSimulationProvider>
            <LoreKeeperProvider>
            <GuestProvider>
              <EntityModalProvider>
                <CurrentContextProvider>
                  <SoulProfileChatProvider>
                    <DevelopmentNotice />
                    <BackendUnavailableBanner />
                    <DatabaseOpsBanner />
                    <DemoMutationEffects />
                    <CelebrationHost />
                    <Router />
                    <MockDataIndicator />
                  </SoulProfileChatProvider>
                </CurrentContextProvider>
              </EntityModalProvider>
            </GuestProvider>
            </LoreKeeperProvider>
            </LoreReadinessSimulationProvider>
          </MockDataProvider>
          </ChatThreadProvider>
        </BrowserRouter>
        </ReduxProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('[LoreBook] React mount failed:', error);
    rootElement.innerHTML = `
      <div style="padding:20px;color:white;text-align:center;background:black;min-height:100vh;font-family:monospace;">
        <h1 style="color:#ef4444;">Application Failed to Mount</h1>
        <pre style="text-align:left;background:rgba(255,0,0,0.2);padding:15px;border-radius:4px;overflow:auto;max-width:800px;margin:0 auto;color:#fca5a5;">${error instanceof Error ? error.stack : String(error)}</pre>
        <p style="margin-top:20px;color:#64748b;font-size:12px;">Open DevTools (F12) for more details</p>
      </div>
    `;
  }
}
