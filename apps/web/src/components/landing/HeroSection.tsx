// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-24 sm:pt-20 pb-12 sm:pb-0">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-950 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(154,77,255,0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,31,174,0.15),transparent_50%)]" />

      <div className="relative z-10 max-w-5xl mx-auto text-center w-full">
        {/* Badge */}
        <div className="inline-flex items-center space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-primary/30 bg-primary/10 mb-6 sm:mb-8">
          <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          <span className="text-xs sm:text-sm font-medium text-primary">Early Access</span>
        </div>

        {/* Main Heading */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight px-2 sm:px-0">
          Your life has years of history.
          <br />
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            LoreBook remembers all of it.
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-base sm:text-xl md:text-2xl text-white/70 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4 sm:px-6 lg:px-0">
          An autobiographical knowledge base for a human life. LoreBook accumulates
          the people, places, timelines, and chapters of your experience — building
          personal biographies and connected history across years of conversations.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8 sm:mb-12 px-4 sm:px-0">
          <Button
            onClick={() => navigate('/login')}
            size="lg"
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 w-full sm:w-auto"
            rightIcon={<ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />}
          >
            Get Started Free
          </Button>
          <Button
            onClick={() => navigate('/features')}
            variant="outline"
            size="lg"
            className="border-primary/50 text-primary hover:bg-primary/10 text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 w-full sm:w-auto"
          >
            See How It Works
          </Button>
        </div>

        {/* Grounded anchor points */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto px-4 sm:px-0">
          {[
            { label: 'People', sub: 'no re-introducing' },
            { label: 'Places', sub: 'context that sticks' },
            { label: 'Projects', sub: 'history carries forward' },
            { label: 'Patterns', sub: 'noticed over time' },
          ].map(({ label, sub }) => (
            <div key={label} className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-primary mb-1 sm:mb-2">{label}</div>
              <div className="text-xs sm:text-sm text-white/60">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
