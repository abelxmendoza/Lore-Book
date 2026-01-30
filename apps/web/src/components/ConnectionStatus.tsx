import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { config } from '../config/env';
import { Button } from './ui/button';

interface ConnectionStatusProps {
  onDismiss?: () => void;
}

export const ConnectionStatus = ({ onDismiss }: ConnectionStatusProps) => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${config.api.url}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      setIsConnected(response.ok);
      setLastCheck(new Date());
    } catch (error) {
      setIsConnected(false);
      setLastCheck(new Date());
    } finally {
      setIsChecking(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Check on mount and periodically (throttle when using proxy to reduce 500 spam)
  const intervalMs = !config.api.url ? 30_000 : 10_000; // 30s in dev proxy, 10s otherwise
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  // Only show if disconnected and not dismissed (don't show success state)
  if (isConnected !== false || isDismissed) {
    return null;
  }

  const isDeployed = config.env.isProduction || (!config.api.url.includes('localhost') && !config.api.url.includes('127.0.0.1'));

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-5">
      <div className="bg-red-500/90 backdrop-blur-sm border border-red-400/50 rounded-lg shadow-xl p-4 text-white relative">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 rounded hover:bg-red-600/50 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-white/70 hover:text-white" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">Backend Server Offline</h3>
            {isDeployed ? (
              <p className="text-xs text-red-100 mb-3">
                The backend server is not deployed yet. Some features may be unavailable.
              </p>
            ) : (
              <>
                <p className="text-xs text-red-100 mb-3">
                  Cannot connect to backend at <code className="bg-red-600/50 px-1 rounded">{config.api.url}</code>
                </p>
                <div className="space-y-2">
                  <div className="text-xs text-red-100">
                    <p className="font-medium mb-1">To start the backend server:</p>
                    <code className="block bg-red-600/50 px-2 py-1 rounded font-mono text-xs">
                      cd apps/server && npm run dev
                    </code>
                  </div>
                </div>
              </>
            )}
            {lastCheck && (
              <p className="text-xs text-red-200/70 mt-2">
                Last checked: {lastCheck.toLocaleTimeString()}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={checkConnection}
                disabled={isChecking}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs"
              >
                {isChecking ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Retry
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
