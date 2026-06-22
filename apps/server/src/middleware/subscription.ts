import type { Response, NextFunction } from 'express';

import { isPrivilegedAccount } from '../lib/accountAuthority';
import { getUserSubscription } from '../services/stripeService';
import { getCurrentUsage, canCreateEntry, canMakeAiRequest } from '../services/usageTracking';

import type { AuthenticatedRequest } from './auth';

/**
 * Middleware to check if user has active subscription or is within trial period.
 * Owner, admin, and developer accounts bypass all subscription gates.
 */
export async function checkSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isPrivilegedAccount(req.user.id)) return next();

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
 * Privileged platform roles bypass this gate entirely.
 */
export async function requirePremium(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isPrivilegedAccount(req.user.id)) return next();

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
 * Privileged accounts have no entry cap.
 */
export async function checkEntryLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isPrivilegedAccount(req.user.id)) return next();

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
 * Privileged accounts have no AI request cap.
 */
export async function checkAiRequestLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (await isPrivilegedAccount(req.user.id)) return next();

  const check = await canMakeAiRequest(req.user.id);
  if (!check.allowed) {
    const code = check.code ?? 'ai_request_limit';
    const budget = code === 'openai_budget_exceeded'
      ? await import('../services/openaiBudgetService').then((m) => m.getOpenAiBudgetSnapshot())
      : undefined;
    return res.status(403).json({
      error: code === 'ai_request_limit' ? 'AI request limit reached' : code,
      code,
      message: check.reason,
      userMessage: check.reason,
      upgradeRequired: code === 'ai_request_limit',
      ...(budget ? { budget } : {}),
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
    (req as AuthenticatedRequest & { usage?: unknown }).usage = usage;
  } catch (error) {
    console.error('Error attaching usage data:', error);
  }

  next();
}
