/**
 * Admin Header Component
 */

import { Shield, AlertCircle } from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
}

export const AdminHeader = ({ title, subtitle, badge }: AdminHeaderProps) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          {badge && (
            <span className="px-3 py-1 text-xs font-semibold bg-yellow-500/20 text-yellow-500 rounded-full border border-yellow-500/30">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-white/60 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
        <Shield className="h-4 w-4 text-red-400" />
        <span className="text-sm text-red-400 font-medium">Admin Mode</span>
      </div>
    </div>
  );
};
