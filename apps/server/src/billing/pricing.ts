// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

export type SubscriptionTier = 'free' | 'pro' | 'founder';

export const pricingTable: Record<SubscriptionTier, { name: string; price: number; features: string[] }> = {
  free: {
    name: 'Free Tier',
    price: 0,
    features: ['Limited AI calls', 'Community access', 'No encryption', 'Starter timeline']
  },
  pro: {
    name: 'Pro Tier',
    price: 29,
    features: ['Full access', 'Encryption optional', 'X integration', 'Season/Saga engines']
  },
  founder: {
    name: 'Founder Tier',
    price: 99,
    features: ['Priority compute', 'Unlimited AI memory depth', 'Concierge onboarding']
  }
};
