import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../components/RouteGuard';
import { WelcomeSplash } from '../components/common/WelcomeSplash';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ScrollToTopOnNavigate } from '../components/ScrollToTopOnNavigate';

// Lazy load main app
const App = lazy(() => import('./App'));

// Lazy load admin pages (only needed for admin users)
const AdminPage = lazy(() => import('./admin'));
const DevConsolePage = lazy(() => import('./dev-console'));
const ChatDiagnostics = lazy(() => import('../routes/ChatDiagnostics'));

// Lazy load user routes
const Onboarding = lazy(() => import('../routes/Onboarding'));
const AccountCenter = lazy(() => import('../routes/AccountCenter'));
const UpgradePage = lazy(() => import('./upgrade'));

// Lazy load demo runtime (auth-free, synthetic cognition showcase)
const Demo = lazy(() => import('../routes/Demo'));

// Lazy load public routes
const Login = lazy(() => import('../routes/Login'));
const AuthCallback = lazy(() => import('../routes/AuthCallback'));
const NotFound = lazy(() => import('../routes/NotFound'));
const Terms = lazy(() => import('../routes/Terms'));
const PrivacyPolicy = lazy(() => import('../routes/PrivacyPolicy'));
const WhatAIKnows = lazy(() => import('../routes/WhatAIKnows'));
const OntologyExplorerPage = lazy(() => import('../routes/OntologyExplorer'));

// Lazy load landing pages
const Landing = lazy(() => import('../routes/Landing'));
const Features = lazy(() => import('../routes/Features'));
const Investors = lazy(() => import('../routes/Investors'));
const About = lazy(() => import('../routes/About'));
const Lore = lazy(() => import('../routes/Lore'));

/** Legacy /search URLs → Timeline search tab */
const SearchRedirect = () => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const q = params.get('q');
  const target = q
    ? `/timeline?view=search&q=${encodeURIComponent(q)}`
    : '/timeline?view=search';
  return <Navigate to={target} replace />;
};

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
    <>
    <ScrollToTopOnNavigate />
    <WelcomeSplash />
    <Routes>
      {/* Landing Pages - Public routes */}
      <Route
        path="/"
        element={
          <LazyRoute>
            <Landing />
          </LazyRoute>
        }
      />
      <Route 
        path="/features" 
        element={
          <LazyRoute>
            <Features />
          </LazyRoute>
        } 
      />
      <Route 
        path="/investors" 
        element={
          <LazyRoute>
            <Investors />
          </LazyRoute>
        } 
      />
      <Route 
        path="/about" 
        element={
          <LazyRoute>
            <About />
          </LazyRoute>
        } 
      />
      <Route
        path="/lore"
        element={
          <LazyRoute>
            <Lore />
          </LazyRoute>
        }
      />

      {/* /home — authenticated dashboard */}
      <Route
        path="/home"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="home" /></ProtectedRoute>
          </LazyRoute>
        }
      />

      {/* Feature routes mapped to surfaces */}
      <Route 
        path="/chat" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="chat" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/chat/:threadId" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="chat" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/timeline" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="timeline" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route path="/search" element={<SearchRedirect />} />
      <Route 
        path="/characters" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="characters" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/locations"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="locations" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="projects" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/memoir"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="memoir" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/lorebookLibrary"
        element={<Navigate to="/lorebook/library" replace />}
      />
      <Route
        path="/lorebook"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="lorebook" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      {/* Wildcard so /lorebook/* (future sub-routes, focus params, etc.) still surface as lorebook */}
      <Route
        path="/lorebook/*"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="lorebook" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route 
        path="/photos" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="photos" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/memories"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="events" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/perceptions"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="perceptions" /></ProtectedRoute>
          </LazyRoute>
        }
      />

      {/* /demo — public showcase runtime, no AuthGate, no ToS, synthetic cognition only */}
      <Route
        path="/demo"
        element={
          <LazyRoute>
            <Demo />
          </LazyRoute>
        }
      />
      <Route
        path="/events"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="events" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/narrative-anchors"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="anchors" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/intelligence"
        element={
          <LazyRoute>
            <ProtectedRoute access="admin"><App defaultSurface="intelligence" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route 
        path="/entities" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="entities" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/family" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="family" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/organizations" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="organizations" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/skills" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="skills" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/discovery"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="discovery" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      {/* Sub-routes for Discovery panels — App surfaces as 'discovery' for all */}
      <Route
        path="/discovery/*"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="discovery" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route 
        path="/love" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="love" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/quests" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="quests" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/gaps"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="gaps" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/trust"
        element={
          <LazyRoute>
            <Navigate to="/gaps" replace />
          </LazyRoute>
        }
      />
      <Route
        path="/saga"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="saga" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="documents" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route 
        path="/continuity" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="continuity" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/subscription" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="subscription" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/pricing"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="pricing" /></ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route
        path="/upgrade"
        element={
          <LazyRoute>
            <UpgradePage />
          </LazyRoute>
        }
      />
      <Route 
        path="/security" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="security" /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/privacy" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="privacy-settings" /></ProtectedRoute>
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
        path="/auth/callback" 
        element={
          <LazyRoute>
            <AuthCallback />
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
            <ProtectedRoute access="authenticated">
              <Onboarding />
            </ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route 
        path="/account" 
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><AccountCenter /></ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/guide"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><App defaultSurface="guide" /></ProtectedRoute>
          </LazyRoute>
        }
      />

      {/* Identity custody */}
      <Route
        path="/what-ai-knows"
        element={
          <LazyRoute>
            <ProtectedRoute access="authenticated"><WhatAIKnows /></ProtectedRoute>
          </LazyRoute>
        }
      />

      {/* Admin / operator routes — server authority required */}
      <Route
        path="/ontology"
        element={
          <LazyRoute>
            <ProtectedRoute access="admin">
              <OntologyExplorerPage />
            </ProtectedRoute>
          </LazyRoute>
        }
      />
      <Route 
        path="/admin" 
        element={
          <LazyRoute>
            <ProtectedRoute access="admin">
              <AdminPage />
            </ProtectedRoute>
          </LazyRoute>
        } 
      />
      {/* Dev Console — role-gated; always 404 in production builds */}
      <Route 
        path="/dev-console" 
        element={
          <LazyRoute>
            <ProtectedRoute access="dev-console">
              <DevConsolePage />
            </ProtectedRoute>
          </LazyRoute>
        } 
      />
      <Route
        path="/diagnostics/chat"
        element={
          <LazyRoute>
            <ProtectedRoute access="dev-console">
              <ChatDiagnostics />
            </ProtectedRoute>
          </LazyRoute>
        }
      />

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
    </>
  );
};
