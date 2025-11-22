import { Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import AdminPage from './admin';
import DevConsolePage from './dev-console';
import Onboarding from '../routes/Onboarding';
import AccountCenter from '../routes/AccountCenter';
import Login from '../routes/Login';
import NotFound from '../routes/NotFound';
import Terms from '../routes/Terms';
import PrivacyPolicy from '../routes/PrivacyPolicy';
import { AuthGate } from '../components/AuthGate';

export const Router = () => {
  return (
    <Routes>
      {/* Root — defaults to chat */}
      <Route path="/" element={<AuthGate><App defaultSurface="chat" /></AuthGate>} />

      {/* Feature routes mapped to surfaces */}
      <Route path="/chat" element={<AuthGate><App defaultSurface="chat" /></AuthGate>} />
      <Route path="/timeline" element={<AuthGate><App defaultSurface="timeline" /></AuthGate>} />
      <Route path="/search" element={<AuthGate><App defaultSurface="search" /></AuthGate>} />
      <Route path="/characters" element={<AuthGate><App defaultSurface="characters" /></AuthGate>} />
      <Route path="/locations" element={<AuthGate><App defaultSurface="locations" /></AuthGate>} />
      <Route path="/memoir" element={<AuthGate><App defaultSurface="memoir" /></AuthGate>} />
      <Route path="/lorebook" element={<AuthGate><App defaultSurface="lorebook" /></AuthGate>} />
      <Route path="/discovery" element={<AuthGate><App defaultSurface="discovery" /></AuthGate>} />
      <Route path="/continuity" element={<AuthGate><App defaultSurface="continuity" /></AuthGate>} />
      <Route path="/subscription" element={<AuthGate><App defaultSurface="subscription" /></AuthGate>} />
      <Route path="/pricing" element={<AuthGate><App defaultSurface="pricing" /></AuthGate>} />
      <Route path="/security" element={<AuthGate><App defaultSurface="security" /></AuthGate>} />
      <Route path="/privacy" element={<AuthGate><App defaultSurface="privacy-settings" /></AuthGate>} />

      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />

      {/* New User Routes */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/account" element={<AuthGate><AccountCenter /></AuthGate>} />

      {/* Existing Admin Routes */}
      <Route path="/admin" element={<AuthGate><AdminPage /></AuthGate>} />
      <Route path="/dev-console" element={<AuthGate><DevConsolePage /></AuthGate>} />

      {/* 404 - Must be last */}
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

