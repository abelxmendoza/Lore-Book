// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: string;
  children?: ReactNode;
}

export const FeatureCard = ({
  icon: Icon,
  title,
  description,
  highlight,
  children,
}: FeatureCardProps) => {
  return (
    <div className="group relative rounded-xl sm:rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 hover:border-primary/50 transition-all duration-300 hover:shadow-neon">
      <div className="flex items-start space-x-3 sm:space-x-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-all">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-1.5 sm:mb-2">{title}</h3>
          {highlight && (
            <p className="text-xs sm:text-sm text-primary/80 font-medium mb-1.5 sm:mb-2">{highlight}</p>
          )}
          <p className="text-xs sm:text-sm text-white/70 leading-relaxed">{description}</p>
          {children && <div className="mt-3 sm:mt-4">{children}</div>}
        </div>
      </div>
    </div>
  );
};
