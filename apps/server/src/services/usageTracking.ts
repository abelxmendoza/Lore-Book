import { createClient } from '@supabase/supabase-js';

import { config } from '../config';

import { getUserSubscription, type SubscriptionData } from './stripeService';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

export interface UsageData {
  entryCount: number;
  aiRequestsCount: number;
  entryLimit: number;
  aiLimit: number;
  isPremium: boolean;
  isTrial: boolean;
}

/**
 * Get current month usage for a user
 */
export async function getCurrentUsage(userId: string): Promise<UsageData> {
  const subscription = await getUserSubscription(userId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get or create usage record for current month
  const { data: usage, error } = await supabase
    .from('subscription_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('month', monthStart.toISOString().split('T')[0])
    .single();

  const entryCount = usage?.entry_count || 0;
  const aiRequestsCount = usage?.ai_requests_count || 0;

  // Determine limits based on subscription
  const isPremium = subscription?.planType === 'premium';
  const isTrial = subscription?.status === 'trial' || 
    (subscription?.trialEndsAt && subscription.trialEndsAt > now);

  const entryLimit = isPremium || isTrial ? Infinity : config.freeTierEntryLimit || 50;
  const aiLimit = isPremium || isTrial ? Infinity : config.freeTierAiLimit || 100;

  return {
    entryCount,
    aiRequestsCount,
    entryLimit,
    aiLimit,
    isPremium: isPremium || false,
    isTrial: isTrial || false,
  };
}

/**
 * Increment entry count for current month
 */
export async function incrementEntryCount(userId: string): Promise<void> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStr = monthStart.toISOString().split('T')[0];

  // Use the database function to get or create usage record
  const { error: funcError } = await supabase.rpc('get_or_create_usage', {
    p_user_id: userId,
    p_month: monthStr,
  });

  if (funcError) {
    // Fallback: manually get or create
    const { data: existing } = await supabase
      .from('subscription_usage')
      .select('id, entry_count')
      .eq('user_id', userId)
      .eq('month', monthStr)
      .single();

    if (existing) {
      await supabase
        .from('subscription_usage')
        .update({ 
          entry_count: existing.entry_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('subscription_usage')
        .insert({
          user_id: userId,
          month: monthStr,
          entry_count: 1,
          ai_requests_count: 0,
        });
    }
  } else {
    // Increment entry count
    const { data: usage } = await supabase
      .from('subscription_usage')
      .select('entry_count')
      .eq('user_id', userId)
      .eq('month', monthStr)
      .single();

    if (usage) {
      await supabase
        .from('subscription_usage')
        .update({ 
          entry_count: usage.entry_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('month', monthStr);
    }
  }
}

/**
 * Increment AI request count for current month
 */
export async function incrementAiRequestCount(userId: string): Promise<void> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStr = monthStart.toISOString().split('T')[0];

  // Use the database function to get or create usage record
  const { error: funcError } = await supabase.rpc('get_or_create_usage', {
    p_user_id: userId,
    p_month: monthStr,
  });

  if (funcError) {
    // Fallback: manually get or create
    const { data: existing } = await supabase
      .from('subscription_usage')
      .select('id, ai_requests_count')
      .eq('user_id', userId)
      .eq('month', monthStr)
      .single();

    if (existing) {
      await supabase
        .from('subscription_usage')
        .update({ 
          ai_requests_count: existing.ai_requests_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('subscription_usage')
        .insert({
          user_id: userId,
          month: monthStr,
          entry_count: 0,
          ai_requests_count: 1,
        });
    }
  } else {
    // Increment AI request count
    const { data: usage } = await supabase
      .from('subscription_usage')
      .select('ai_requests_count')
      .eq('user_id', userId)
      .eq('month', monthStr)
      .single();

    if (usage) {
      await supabase
        .from('subscription_usage')
        .update({ 
          ai_requests_count: usage.ai_requests_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('month', monthStr);
    }
  }
}

/**
 * Check if user can create an entry (within limits)
 */
export async function canCreateEntry(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const usage = await getCurrentUsage(userId);

  if (usage.isPremium || usage.isTrial) {
    return { allowed: true };
  }

  if (usage.entryCount >= usage.entryLimit) {
    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${usage.entryLimit} entries. Upgrade to Premium for unlimited entries.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can make an AI request (within limits)
 */
export async function canMakeAiRequest(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const usage = await getCurrentUsage(userId);

  if (usage.isPremium || usage.isTrial) {
    return { allowed: true };
  }

  if (usage.aiRequestsCount >= usage.aiLimit) {
    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${usage.aiLimit} AI requests. Upgrade to Premium for unlimited requests.`,
    };
  }

  return { allowed: true };
}

/**
 * Reset monthly usage (called when subscription period starts)
 */
export async function resetMonthlyUsage(userId: string): Promise<void> {
  // This is typically handled automatically by creating new records each month
  // But can be called explicitly if needed
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStr = monthStart.toISOString().split('T')[0];

  // Ensure usage record exists for current month (starts at 0)
  await supabase
    .from('subscription_usage')
    .upsert({
      user_id: userId,
      month: monthStr,
      entry_count: 0,
      ai_requests_count: 0,
    }, {
      onConflict: 'user_id,month',
    });
}

