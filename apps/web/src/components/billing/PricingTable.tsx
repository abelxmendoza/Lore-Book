// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { UpgradeButton } from './UpgradeButton';

const tiers = [
  {
    id: 'free',
    name: 'Free Tier',
    price: '$0',
    features: ['Limited AI calls', 'Starter timeline', 'Community access']
  },
  {
    id: 'premium',
    name: 'Premium Tier',
    price: '$15/month',
    features: ['Unlimited journal entries', 'Unlimited AI requests', 'Advanced timeline visualization', 'All premium features', 'Priority support', 'Early access to new features', 'Export to PDF/eBook', 'Advanced analytics']
  },
  {
    id: 'founder',
    name: 'Founder Tier',
    price: '$99',
    features: ['Priority compute', 'Unlimited AI memory depth', 'Concierge onboarding']
  }
];

interface PricingTableProps {
  onUpgrade?: (tier: string) => void;
}

export const PricingTable = ({ onUpgrade }: PricingTableProps) => {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {tiers.map((tier) => (
        <div key={tier.id} className="rounded-2xl border border-primary/60 bg-black/60 p-6 shadow-lg">
          <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
          <p className="mt-2 text-3xl font-bold text-primary">{tier.price}</p>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <UpgradeButton tier={tier.id} onUpgrade={onUpgrade} />
          </div>
        </div>
      ))}
    </div>
  );
};
