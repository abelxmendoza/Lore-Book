import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';
import { getUserSubscription } from '../services/stripeService';
import { getCurrentUsage, canCreateEntry, canMakeAiRequest } from '../services/usageTracking';

/**
 * Middleware to check if user has active subscription or is within trial period
 */
export async function checkSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subscription = await getUserSubscription(req.user.id);
  const now = new Date();

  // If no subscription record, treat as free tier
  if (!subscription) {
    return next();
  }

  // Check if trial is still active
  if (subscription.trialEndsAt && subscription.trialEndsAt > now) {
    return next();
  }

  // Check if subscription is active
  if (subscription.status === 'active' && subscription.planType === 'premium') {
    return next();
  }

  // Free tier users can continue
  if (subscription.planType === 'free') {
    return next();
  }

  // Past due or canceled subscriptions
  if (subscription.status === 'past_due' || subscription.status === 'canceled') {
    return res.status(403).json({
      error: 'Subscription required',
      message: 'Your subscription has expired. Please renew to continue using premium features.',
      upgradeRequired: true,
    });
  }

  next();
}

/**
 * Middleware to require premium subscription
 */
export async function requirePremium(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subscription = await getUserSubscription(req.user.id);
  const now = new Date();

  // Check if in trial period
  if (subscription?.trialEndsAt && subscription.trialEndsAt > now) {
    return next();
  }

  // Check if has active premium subscription
  if (subscription?.planType === 'premium' && subscription.status === 'active') {
    return next();
  }

  return res.status(403).json({
    error: 'Premium subscription required',
    message: 'This feature requires a premium subscription. Upgrade to unlock all features.',
    upgradeRequired: true,
  });
}

/**
 * Middleware to check entry creation limits
 */
export async function checkEntryLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const check = await canCreateEntry(req.user.id);
  if (!check.allowed) {
    return res.status(403).json({
      error: 'Entry limit reached',
      message: check.reason,
      upgradeRequired: true,
    });
  }

  next();
}

/**
 * Middleware to check AI request limits
 */
export async function checkAiRequestLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const check = await canMakeAiRequest(req.user.id);
  if (!check.allowed) {
    return res.status(403).json({
      error: 'AI request limit reached',
      message: check.reason,
      upgradeRequired: true,
    });
  }

  next();
}

/**
 * Middleware to attach usage data to request
 */
export async function attachUsageData(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return next();
  }

  try {
    const usage = await getCurrentUsage(req.user.id);
    (req as any).usage = usage;
  } catch (error) {
    console.error('Error attaching usage data:', error);
  }

  next();
}

