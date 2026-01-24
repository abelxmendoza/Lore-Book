// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

export type SubscriptionTier = 'free' | 'premium' | 'founder';

export const pricingTable: Record<SubscriptionTier, { name: string; price: number; features: string[] }> = {
  free: {
    name: 'Free Tier',
    price: 0,
    features: ['Limited AI calls', 'Community access', 'No encryption', 'Starter timeline']
  },
  premium: {
    name: 'Premium Tier',
    price: 15,
    features: ['Unlimited journal entries', 'Unlimited AI requests', 'Advanced timeline visualization', 'All premium features', 'Priority support', 'Early access to new features', 'Export to PDF/eBook', 'Advanced analytics']
  },
  founder: {
    name: 'Founder Tier',
    price: 99,
    features: ['Priority compute', 'Unlimited AI memory depth', 'Concierge onboarding']
  }
};
