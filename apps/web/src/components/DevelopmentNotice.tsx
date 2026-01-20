/**
 * Development Notice Component
 * 
 * Shows a prominent notice when the app is in development or using mock data.
 * This informs users that the app is still being built and some features may use demo data.
 */

import { useState, useEffect } from 'react';
import { X, Info, Code, Database, Rocket } from 'lucide-react';
import { config } from '../config/env';
import { Button } from './ui/button';

export function DevelopmentNotice() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Only show if enabled in config
    if (!config.dev.showDevNotice) {
      return;
    }

    // Check if user has dismissed it before
    const dismissed = localStorage.getItem('dev-notice-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // Show after a brief delay for better UX
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('dev-notice-dismissed', 'true');
  };

  if (!config.dev.showDevNotice || isDismissed) {
    return null;
  }

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dev-notice-title"
      aria-describedby="dev-notice-description"
    >
      <div className="relative w-full max-w-2xl bg-gradient-to-br from-purple-900/95 via-black/95 to-purple-950/95 border-2 border-primary/50 rounded-2xl shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
          aria-label="Dismiss development notice"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Rocket className="h-6 w-6 text-black" />
          </div>
          <div className="flex-1">
            <h2
              id="dev-notice-title"
              className="text-2xl font-bold text-white mb-2 flex items-center gap-2"
            >
              <Info className="h-6 w-6 text-primary" />
              App Under Development
            </h2>
            <p id="dev-notice-description" className="text-white/80 text-lg">
              Lore Book is still being built! You're seeing an early preview of the UI. 
              Some features may not be fully functional yet.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 text-white/70">
          <div className="bg-black/40 border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white mb-1">Demo Data</p>
                <p className="text-sm">
                  Some features are using sample data to showcase the interface. 
                  Real functionality will be available once the backend is fully deployed.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Code className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white mb-1">Active Development</p>
                <p className="text-sm">
                  We're continuously improving the app. Features may change, 
                  and some functionality may not be fully operational yet.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <p className="text-sm text-primary/90">
              <strong>What works:</strong> You can explore the UI, navigate through different sections, 
              and see how the app will look and feel. The interface is fully functional for demonstration purposes.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <p className="text-sm text-white/60">
            This notice can be dismissed and won't appear again
          </p>
          <Button
            onClick={handleDismiss}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            aria-label="Got it, continue to app"
          >
            Got it, let's explore!
          </Button>
        </div>
      </div>
    </div>
  );
}

