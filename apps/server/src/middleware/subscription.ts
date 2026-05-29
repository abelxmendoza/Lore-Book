import type { Response, NextFunction } from 'express';

import { getUserSubscription } from '../services/stripeService';
import { getCurrentUsage, canCreateEntry, canMakeAiRequest } from '../services/usageTracking';
import { supabaseAdmin } from '../services/supabaseClient';

import type { AuthenticatedRequest } from './auth';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'abelxmendoza@gmail.com';

/**
 * Returns true for the admin account — admins are never gated by billing.
 * Checks both email and app_metadata.role so it works even if email changes.
 */
async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const role = data.user.app_metadata?.role || data.user.user_metadata?.role;
    if (role === 'admin' || role === 'developer') return true;
    if (data.user.email && data.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Middleware to check if user has active subscription or is within trial period.
 * Admin accounts are always allowed through.
 */
export async function checkSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isAdminUser(req.user.id)) return next();

  const subscription = await getUserSubscription(req.user.id);
  const now = new Date();

  if (!subscription) return next();

  if (subscription.trialEndsAt && subscription.trialEndsAt > now) return next();

  if (subscription.status === 'active' && subscription.planType === 'premium') return next();

  if (subscription.planType === 'free') return next();

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
 * Middleware to require premium subscription.
 * Admin accounts bypass this gate entirely.
 */
export async function requirePremium(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isAdminUser(req.user.id)) return next();

  const subscription = await getUserSubscription(req.user.id);
  const now = new Date();

  if (subscription?.trialEndsAt && subscription.trialEndsAt > now) return next();

  if (subscription?.planType === 'premium' && subscription.status === 'active') return next();

  return res.status(403).json({
    error: 'Premium subscription required',
    message: 'This feature requires a premium subscription. Upgrade to unlock all features.',
    upgradeRequired: true,
  });
}

/**
 * Middleware to check entry creation limits.
 * Admin accounts have no entry cap.
 */
export async function checkEntryLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isAdminUser(req.user.id)) return next();

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
 * Middleware to check AI request limits.
 * Admin accounts have no AI request cap.
 */
export async function checkAiRequestLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isAdminUser(req.user.id)) return next();

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
 * Middleware to attach usage data to request.
 */
export async function attachUsageData(
  req: AuthenticatedRequest,
  _res: Response,
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
