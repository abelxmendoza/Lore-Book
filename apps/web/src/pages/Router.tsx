import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from '../components/AuthGate';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Lazy load main app
const App = lazy(() => import('./App'));

// Lazy load admin pages (only needed for admin users)
const AdminPage = lazy(() => import('./admin'));
const DevConsolePage = lazy(() => import('./dev-console'));

// Lazy load user routes
const Onboarding = lazy(() => import('../routes/Onboarding'));
const AccountCenter = lazy(() => import('../routes/AccountCenter'));

// Lazy load public routes
const Login = lazy(() => import('../routes/Login'));
const NotFound = lazy(() => import('../routes/NotFound'));
const Terms = lazy(() => import('../routes/Terms'));
const PrivacyPolicy = lazy(() => import('../routes/PrivacyPolicy'));
const UserGuide = lazy(() => import('../components/guide/UserGuide'));
const Perceptions = lazy(() => import('../routes/Perceptions'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-black">
    <div className="text-center">
      <div className="mx-auto w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-white/60">Loading...</p>
    </div>
  </div>
);

// Wrapper component for lazy-loaded routes with Suspense
const LazyRoute = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<LoadingFallback />}>
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  </Suspense>
);

export const Router = () => {
  return (
    <Routes>
      {/* Root — defaults to chat */}
      <Route 
        path="/" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="chat" /></AuthGate>
          </LazyRoute>
        } 
      />

      {/* Feature routes mapped to surfaces */}
      <Route 
        path="/chat" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="chat" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/timeline" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="timeline" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/search" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="search" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/characters" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="characters" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/locations" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="locations" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/memoir" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="memoir" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/lorebook" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="lorebook" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/photos" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="photos" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/discovery" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="discovery" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/continuity" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="continuity" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/subscription" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="subscription" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/pricing" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="pricing" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/security" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="security" /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/privacy" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="privacy-settings" /></AuthGate>
          </LazyRoute>
        } 
      />

      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          <LazyRoute>
            <Login />
          </LazyRoute>
        } 
      />
      <Route 
        path="/terms" 
        element={
          <LazyRoute>
            <Terms />
          </LazyRoute>
        } 
      />
      <Route 
        path="/privacy-policy" 
        element={
          <LazyRoute>
            <PrivacyPolicy />
          </LazyRoute>
        } 
      />

      {/* New User Routes */}
      <Route 
        path="/onboarding" 
        element={
          <LazyRoute>
            <Onboarding />
          </LazyRoute>
        } 
      />
      <Route 
        path="/account" 
        element={
          <LazyRoute>
            <AuthGate><AccountCenter /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/guide" 
        element={
          <LazyRoute>
            <AuthGate><UserGuide /></AuthGate>
          </LazyRoute>
        } 
      />
      <Route 
        path="/perceptions" 
        element={
          <LazyRoute>
            <AuthGate><App defaultSurface="perceptions" /></AuthGate>
          </LazyRoute>
        } 
      />

      {/* Admin Routes - Protected in production */}
      <Route 
        path="/admin" 
        element={
          <LazyRoute>
            <AuthGate>
              <AdminPage />
            </AuthGate>
          </LazyRoute>
        } 
      />
      {/* Dev Console - Only available in development */}
      {!import.meta.env.PROD && (
        <Route 
          path="/dev-console" 
          element={
            <LazyRoute>
              <AuthGate>
                <DevConsolePage />
              </AuthGate>
            </LazyRoute>
          } 
        />
      )}

      {/* 404 - Must be last */}
      <Route 
        path="/404" 
        element={
          <LazyRoute>
            <NotFound />
          </LazyRoute>
        } 
      />
      <Route 
        path="*" 
        element={
          <LazyRoute>
            <NotFound />
          </LazyRoute>
        } 
      />
    </Routes>
  );
};

