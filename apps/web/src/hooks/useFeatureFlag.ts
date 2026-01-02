import { useMemo } from 'react';
import { getFeatureFlag, type FeatureFlag } from '../config/featureFlags';
import { useAuth } from '../lib/supabase';

/**
 * Hook to check if a feature flag is enabled
 */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { user } = useAuth();
  
  // Check if user is admin (you may need to adjust this based on your auth system)
  const isAdmin = useMemo(() => {
    // Check user metadata or role
    return user?.user_metadata?.role === 'admin' || 
           user?.user_metadata?.role === 'developer';
  }, [user]);
  
  return useMemo(() => getFeatureFlag(flag, isAdmin), [flag, isAdmin]);
}

