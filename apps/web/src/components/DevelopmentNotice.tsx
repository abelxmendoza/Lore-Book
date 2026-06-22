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
      <div className="relative w-full max-w-2xl bg-gradient-to-br from-purple-900/95 via-black/95 to-purple-950/95 border border-primary/50 rounded-lg sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 animate-in fade-in zoom-in duration-300 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
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
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
            <Rocket className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="mb-2 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-200">
              Early Access · Alpha
            </div>
            <h2
              id="dev-notice-title"
              className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2"
            >
              Welcome to Lore Book
            </h2>
            <p id="dev-notice-description" className="text-white/70 text-sm sm:text-base">
              Lore Book is live for early testing. Chat is the front door — every conversation
              feeds a growing record of people, places, and moments in your life.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 sm:space-y-4 text-white/70">
          <div className="grid gap-3">
            <div className="flex items-start gap-2 sm:gap-3">
              <Rocket className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white mb-1 text-sm sm:text-base">What's live</p>
                <p className="text-xs sm:text-sm">
                  Chat, journaling, and memory extraction are ready. Characters, locations, events,
                  relationships, and lorebooks can start forming from what you share — and improve as
                  your story grows.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 sm:gap-3">
              <Database className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white mb-1 text-sm sm:text-base">Still maturing</p>
                <p className="text-xs sm:text-sm">
                  Discovery views — mood, goals, perceptions, and similar — may show sample or partial
                  data until your record has enough real signal.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 sm:gap-3">
              <Code className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white mb-1 text-sm sm:text-base">Moving fast</p>
                <p className="text-xs sm:text-sm">
                  Features ship weekly. Layouts, labels, and flows may shift, improve, or briefly break
                  — that's expected during early access.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
            <Info className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-primary/90">
              <strong>Start in Chat.</strong> Tell Lore Book about your day, someone in your life,
              or a moment worth remembering — the rest builds from there over time.
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
