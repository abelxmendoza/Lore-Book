// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';

interface CTASectionProps {
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    path: string;
  };
  secondaryAction?: {
    label: string;
    path: string;
  };
  variant?: 'default' | 'investor';
}

export const CTASection = ({
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = 'default',
}: CTASectionProps) => {
  const navigate = useNavigate();
  
  return (
    <section className="relative py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-gradient-to-br from-purple-950/50 to-black/60 backdrop-blur-sm p-6 sm:p-8 md:p-12 shadow-neon">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4 px-2 sm:px-0">{title}</h2>
          <p className="text-base sm:text-lg text-white/70 mb-6 sm:mb-8 max-w-2xl mx-auto px-2 sm:px-0">{description}</p>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            {primaryAction && (
              <Button
                onClick={() => {
                  if (primaryAction.path.startsWith('mailto:')) {
                    window.location.href = primaryAction.path;
                  } else {
                    navigate(primaryAction.path);
                  }
                }}
                size="lg"
                className={`w-full sm:w-auto ${
                  variant === 'investor'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                }`}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {primaryAction.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                onClick={() => navigate(secondaryAction.path)}
                variant="outline"
                size="lg"
                className="w-full sm:w-auto border-primary/50 text-primary hover:bg-primary/10"
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
