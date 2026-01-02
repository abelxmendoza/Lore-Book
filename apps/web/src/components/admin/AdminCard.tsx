/**
 * Admin Card Component
 */

import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';

interface AdminCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  description?: string;
}

export const AdminCard = ({ title, value, icon: Icon, trend, description }: AdminCardProps) => {
  return (
    <Card className="bg-black/40 border-border/60 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-white/60" />}
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide">{title}</h3>
          </div>
          {trend && (
            <span className={`text-xs font-semibold ${
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            }`}>
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-white mb-1">{value.toLocaleString()}</p>
        {description && (
          <p className="text-xs text-white/50">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};
