import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/supabase';
import { LiveLogs } from '../../components/dev/LiveLogs';
import { ComponentPreview } from '../../components/dev/ComponentPreview';
import { APITester } from '../../components/dev/APITester';
import { FlagTogglePanel } from '../../components/dev/FlagTogglePanel';
import { DBTools } from '../../components/dev/DBTools';
import { canAccessDevConsole } from '../../middleware/roleGuard';
import { config } from '../../config/env';
import { NotFound } from '../../routes/NotFound';

type DevView = 'logs' | 'components' | 'preview' | 'api' | 'flags' | 'db';

export const DevConsolePage = () => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<DevView>('logs');
  
  const apiEnv = import.meta.env.VITE_API_ENV || import.meta.env.MODE || 'dev';
  
  // Check access: API_ENV === "dev" OR user.id == ADMIN_ID
  // In production, dev console is COMPLETELY DISABLED
  const hasAccess = canAccessDevConsole(user || null);

  useEffect(() => {
    if (!hasAccess) {
      window.location.href = '/';
      return;
    }
  }, [hasAccess]);

  // In production, show 404 instead of null to prevent route discovery
  if (!hasAccess) {
    if (config.env.isProduction) {
      return <NotFound />;
    }
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-900 via-orange-950/20 to-gray-900">
      <aside className="w-64 border-r border-orange-500/30 bg-black/40 p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-orange-400">Dev Console</h1>
          <p className="text-xs text-white/50 mt-1">Development Tools</p>
        </div>
        
        <nav className="space-y-1">
          {[
            { id: 'logs' as DevView, label: 'Live Logs' },
            { id: 'components' as DevView, label: 'Component Preview' },
            { id: 'preview' as DevView, label: 'Draft UI Preview' },
            { id: 'api' as DevView, label: 'API Testing' },
            { id: 'flags' as DevView, label: 'Feature Flags' },
            { id: 'db' as DevView, label: 'Database Tools' },
          ].map((item) => {
            const isActive = currentView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-orange-500/20 border border-orange-500/50 text-white'
                    : 'text-white/70 hover:bg-orange-500/10 hover:text-white border border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 p-6 text-white">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dev Console</h1>
            <p className="text-sm text-white/60">Development and debugging tools</p>
          </div>
          <div className="rounded-lg border border-orange-500/50 bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-200">
            ENV: {apiEnv === 'production' ? 'PROD' : apiEnv === 'staging' ? 'STAGING' : 'DEV'}
          </div>
        </div>

        {currentView === 'logs' && <LiveLogs />}
        {currentView === 'components' && <ComponentPreview />}
        {currentView === 'preview' && (
          <div className="rounded-lg border border-orange-500/30 bg-black/40 p-4">
            <h2 className="text-xl font-semibold mb-4">Draft UI Preview</h2>
            <p className="text-white/60">Timeline v2, graph mode previews coming soon...</p>
          </div>
        )}
        {currentView === 'api' && <APITester />}
        {currentView === 'flags' && <FlagTogglePanel />}
        {currentView === 'db' && <DBTools />}
      </main>
    </div>
  );
};

export default DevConsolePage;

