import { Crown, Zap, Gift, XCircle, Clock } from 'lucide-react';

interface SubscriptionStatusBadgeProps {
  status: string;
  tier?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  free: { label: 'Free', color: 'bg-white/10 text-white/60 border-white/20', icon: Gift },
  trial: { label: 'Trial', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: Clock },
  active: { label: 'Active', color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: Crown },
  past_due: { label: 'Past Due', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30', icon: Zap },
  canceled: { label: 'Canceled', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: XCircle },
  incomplete: { label: 'Incomplete', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30', icon: XCircle },
};

export const SubscriptionStatusBadge = ({ status, tier }: SubscriptionStatusBadgeProps) => {
  const cfg = statusConfig[status] ?? statusConfig.free;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
      {tier && tier !== 'free' && status === 'active' && (
        <span className="opacity-70">· {tier}</span>
      )}
    </span>
  );
};
