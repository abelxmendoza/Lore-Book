# Subscription & Payment System Guide

## Overview

Lore Keeper now includes a comprehensive subscription system powered by Stripe, with a 7-day free trial and $15/month premium pricing.

## Features

### Subscription Tiers

1. **Free Tier**
   - 50 journal entries per month
   - 100 AI requests per month
   - Basic timeline view
   - Character tracking
   - Search functionality

2. **Premium Tier** ($15/month)
   - Unlimited journal entries
   - Unlimited AI requests
   - Advanced timeline visualization
   - All premium features
   - Priority support
   - Early access to new features
   - Export to PDF/eBook
   - Advanced analytics

### 7-Day Free Trial

- New users get 7 days of full Premium access
- No credit card required until trial ends
- Automatic conversion to paid subscription after trial
- Can cancel anytime during trial

## Setup Instructions

### 1. Stripe Account Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard:
   - Secret Key (for backend)
   - Publishable Key (for frontend)
   - Webhook Secret (for webhook verification)

### 2. Create Product and Price

1. In Stripe Dashboard, go to Products
2. Create a new product: "Lore Keeper Premium"
3. Add a recurring price: $15/month
4. Copy the Price ID (starts with `price_`)

### 3. Configure Webhook

1. In Stripe Dashboard, go to Developers > Webhooks
2. Add endpoint: `https://your-domain.com/api/subscription/webhook`
3. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret

### 4. Environment Variables

Add these to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUBSCRIPTION_PRICE_ID=price_...

# Optional: Customize limits
FREE_TIER_ENTRY_LIMIT=50
FREE_TIER_AI_LIMIT=100
```

For frontend, add to `.env` or `vite.config.ts`:
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 5. Database Migration

Run the subscription migration:

```bash
# Using Supabase CLI or your database tool
psql -f migrations/20250115_subscriptions.sql
```

Or apply via Supabase Dashboard SQL editor.

### 6. Migrate Existing Users

Run the migration script to set existing users to free tier:

```bash
cd apps/server
tsx src/scripts/migrateExistingUsers.ts
```

## Usage

### For Users

1. **Starting a Trial**
   - Click "Subscription" in the sidebar
   - Click "Start Free Trial" on the pricing page
   - Enter payment details (not charged during trial)
   - Enjoy 7 days of Premium features

2. **Managing Subscription**
   - Go to Subscription page
   - View usage statistics
   - Cancel or reactivate subscription
   - Update payment method via billing portal

3. **Upgrading from Free**
   - Click "Upgrade" button when limit is reached
   - Or go to Subscription page and click "View Pricing Plans"

### For Developers

#### Checking Subscription Status

```typescript
import { useSubscription } from '../hooks/useSubscription';

const { subscription, loading } = useSubscription();
// subscription.planType: 'free' | 'premium'
// subscription.isTrial: boolean
// subscription.usage: UsageData
```

#### Feature Gating

```typescript
import { FeatureGate } from '../components/subscription/FeatureGate';

<FeatureGate feature="Advanced Analytics" requirePremium>
  <AdvancedAnalyticsComponent />
</FeatureGate>
```

#### Upgrade Prompts

```typescript
import { UpgradePrompt } from '../components/subscription/UpgradePrompt';

<UpgradePrompt
  title="Upgrade Required"
  message="This feature requires Premium"
  feature="Unlimited entries"
/>
```

## API Endpoints

### GET /api/subscription/status
Get current subscription status and usage.

### GET /api/subscription/usage
Get current month usage statistics.

### POST /api/subscription/create
Create a new subscription with 7-day trial.

### POST /api/subscription/cancel
Cancel subscription at period end.

### POST /api/subscription/reactivate
Reactivate a canceled subscription.

### GET /api/subscription/billing-portal
Get Stripe billing portal URL for managing subscription.

### POST /api/subscription/webhook
Stripe webhook endpoint (handles subscription events).

## Privacy & Security

- All payment data is handled securely by Stripe
- We never store credit card information
- User data is encrypted and isolated per user
- GDPR compliant privacy controls
- Users can export or delete their data anytime

## Testing

### Test Cards

Use Stripe test cards for development:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires authentication: `4000 0025 0000 3155`

### Test Webhooks

Use Stripe CLI to forward webhooks locally:

```bash
stripe listen --forward-to localhost:4000/api/subscription/webhook
```

## Troubleshooting

### Subscription not showing
- Check database migration was run
- Verify user has subscription record (auto-created on user creation)
- Check Stripe configuration in environment variables

### Webhook not working
- Verify webhook URL is accessible
- Check webhook secret matches
- Ensure raw body parser is configured (already done in index.ts)

### Payment not processing
- Verify Stripe keys are correct
- Check subscription price ID is set
- Ensure Stripe account is activated

## Support

For subscription-related issues:
1. Check Stripe Dashboard for payment status
2. Review server logs for webhook events
3. Verify database subscription records
4. Check environment variable configuration

