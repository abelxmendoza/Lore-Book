import { LucideIcon } from 'lucide-react';

interface AdminCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  description?: string;
}

export const AdminCard = ({ title, value, icon: Icon, trend, description }: AdminCardProps) => (
  <div className="rounded-2xl border border-white/10 bg-black/30 p-5 hover:border-primary/25 transition-colors">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-white/40" />}
        <p className="text-xs font-semibold uppercase tracking-wider text-white/40">{title}</p>
      </div>
      {trend && (
        <span className={`text-xs font-semibold ${trend.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend.isPositive ? '+' : ''}{trend.value}%
        </span>
      )}
    </div>
    <p className="text-3xl font-bold text-white tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
    {description && <p className="text-xs text-white/35 mt-1">{description}</p>}
  </div>
);
