import { Shield } from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
}

export const AdminHeader = ({ title, subtitle, badge }: AdminHeaderProps) => (
  <div className="flex items-center gap-3 min-w-0">
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg sm:text-xl font-bold text-white truncate">{title}</h1>
        {badge && (
          <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-primary/15 text-primary rounded border border-primary/25 shrink-0">
            <Shield className="h-3 w-3" />
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-white/30 mt-0.5 truncate">{subtitle}</p>}
    </div>
  </div>
);
