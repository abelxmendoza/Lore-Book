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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dev-notice-title"
      aria-describedby="dev-notice-description"
    >
      <div className="relative w-full max-w-2xl bg-gradient-to-br from-purple-900/95 via-black/95 to-purple-950/95 border-2 border-primary/50 rounded-lg sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 animate-in fade-in zoom-in duration-300 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white/60 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10 z-10"
          aria-label="Dismiss development notice"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 sm:gap-4 pr-8 sm:pr-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
            <Rocket className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="dev-notice-title"
              className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2"
            >
              Early Access — Lore Book
            </h2>
            <p id="dev-notice-description" className="text-white/70 text-sm sm:text-base">
              The core experience is live. You can journal, chat, and watch your story take shape.
              We're still building — some features are further along than others.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 sm:space-y-4 text-white/70">
          <div className="bg-black/40 border border-white/10 rounded-lg p-3 sm:p-4 space-y-3">
            <div className="flex items-start gap-2 sm:gap-3">
              <Rocket className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white mb-1 text-sm sm:text-base">What's live</p>
                <p className="text-xs sm:text-sm">
                  Chat, journaling, and memory extraction are fully active. Characters, events,
                  locations, and groups are tracked in real time from your conversations.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 sm:gap-3">
              <Database className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white mb-1 text-sm sm:text-base">Some panels use sample data</p>
                <p className="text-xs sm:text-sm">
                  A few analytical surfaces — mood, goals, perceptions — show sample data
                  to preview what they'll look like as your story grows. The data will fill in over time.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 sm:gap-3">
              <Code className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white mb-1 text-sm sm:text-base">Actively evolving</p>
                <p className="text-xs sm:text-sm">
                  Features ship frequently. Things may shift, improve, or occasionally break.
                  That's the deal with early access — you're part of shaping this.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-primary/90">
              <strong>Start by chatting.</strong> Tell the app about your day, the people in your life,
              or something that happened. Lore Book listens and builds your story from there.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-white/10">
          <p className="text-xs sm:text-sm text-white/40 text-center sm:text-left">
            Won't show again after dismissing
          </p>
          <Button
            onClick={handleDismiss}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 w-full sm:w-auto whitespace-nowrap"
            aria-label="Got it, continue to app"
          >
            <span className="text-sm sm:text-base">Got it, let's go</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

