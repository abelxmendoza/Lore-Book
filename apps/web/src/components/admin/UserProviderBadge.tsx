import { Mail, Chrome, Link } from 'lucide-react';

interface UserProviderBadgeProps {
  providers: string[];
  hasLinkedAccounts?: boolean;
}

const providerConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  email: { label: 'Email', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Mail },
  google: { label: 'Google', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: Chrome },
};

export const UserProviderBadge = ({ providers, hasLinkedAccounts }: UserProviderBadgeProps) => {
  if (!providers || providers.length === 0) {
    return <span className="text-white/30 text-xs">unknown</span>;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {providers.map((provider) => {
        const cfg = providerConfig[provider] ?? {
          label: provider,
          color: 'bg-white/10 text-white/60 border-white/20',
          icon: Mail,
        };
        const Icon = cfg.icon;
        return (
          <span
            key={provider}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.color}`}
          >
            <Icon className="h-3 w-3" />
            {cfg.label}
          </span>
        );
      })}
      {hasLinkedAccounts && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-green-500/20 text-green-300 border-green-500/30 font-medium">
          <Link className="h-3 w-3" />
          Linked
        </span>
      )}
    </div>
  );
};
