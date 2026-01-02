// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import Stripe from 'stripe';

const apiKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;

export const stripe = apiKey
  ? new Stripe(apiKey, {
      apiVersion: '2023-10-16'
    })
  : null;

export const ensureStripe = () => {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_API_KEY to enable billing.');
  }
  return stripe;
};
