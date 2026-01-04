import { fetchJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import { config } from '../config/env';
import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';

export type UserProfile = {
  id: string;
  email: string;
  name?: string;
  bio?: string;
  avatar_url?: string;
  persona?: string;
  created_at: string;
  updated_at?: string;
};

export type PrivacySettings = {
  profileVisibility: 'private' | 'public' | 'friends';
  showEmail: boolean;
  allowDataSharing: boolean;
  twoFactorEnabled: boolean;
};

export type ActivityLog = {
  id: string;
  action: string;
  location?: string;
  device?: string;
  timestamp: string;
  ip_address?: string;
};

export type StorageUsage = {
  total: number;
  used: number;
  memories: number;
  attachments: number;
};

// Fetch user profile
export const fetchUserProfile = async (): Promise<UserProfile> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  try {
    const response = await fetchJson<{ profile: UserProfile }>(
      '/api/user/profile',
      undefined,
      {
        useMockData: getGlobalMockDataEnabled() || config.dev.allowMockData,
        mockData: { profile: {
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          bio: user.user_metadata?.bio || '',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          persona: user.user_metadata?.persona,
          created_at: user.created_at,
        }},
      }
    );
    return response.profile;
  } catch (error) {
    // Fallback to user metadata if API fails (always available)
    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      bio: user.user_metadata?.bio || '',
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
      persona: user.user_metadata?.persona,
      created_at: user.created_at,
    };
  }
};

// Update user profile
export const updateUserProfile = async (updates: {
  name?: string;
  bio?: string;
  avatar_url?: string;
  persona?: string;
}): Promise<UserProfile> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  try {
    // Try API endpoint first
    const response = await fetchJson<{ profile: UserProfile }>('/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.profile;
  } catch (error) {
    // Fallback to Supabase user metadata update
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        ...updates,
      },
    });
    if (updateError) throw updateError;
    
    return {
      id: data.user.id,
      email: data.user.email || '',
      name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
      bio: data.user.user_metadata?.bio || '',
      avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
      persona: data.user.user_metadata?.persona,
      created_at: data.user.created_at,
    };
  }
};

// Fetch privacy settings
export const fetchPrivacySettings = async (): Promise<PrivacySettings> => {
  const defaultSettings: PrivacySettings = {
    profileVisibility: 'private',
    showEmail: false,
    allowDataSharing: false,
    twoFactorEnabled: false,
  };

  try {
    const response = await fetchJson<{ settings: PrivacySettings }>(
      '/api/user/privacy-settings',
      undefined,
      {
        useMockData: getGlobalMockDataEnabled() || config.dev.allowMockData,
        mockData: { settings: defaultSettings },
      }
    );
    return response.settings;
  } catch (error) {
    // Return defaults if API fails
    return defaultSettings;
  }
};

// Update privacy settings
export const updatePrivacySettings = async (settings: PrivacySettings): Promise<PrivacySettings> => {
  const response = await fetchJson<{ settings: PrivacySettings }>('/api/user/privacy-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.settings;
};

// Fetch activity logs
export const fetchActivityLogs = async (limit: number = 50): Promise<ActivityLog[]> => {
  const mockLogs: ActivityLog[] = [
    {
      id: '1',
      action: 'Login',
      location: 'San Francisco, CA',
      device: 'Chrome on MacOS',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      action: 'Password Changed',
      location: 'San Francisco, CA',
      device: 'Chrome on MacOS',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      action: 'Login',
      location: 'New York, NY',
      device: 'Safari on iPhone',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '4',
      action: 'Subscription Updated',
      location: 'San Francisco, CA',
      device: 'Chrome on MacOS',
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  try {
    const response = await fetchJson<{ logs: ActivityLog[] }>(
      `/api/user/activity?limit=${limit}`,
      undefined,
      {
        useMockData: getGlobalMockDataEnabled() || config.dev.allowMockData,
        mockData: { logs: mockLogs },
      }
    );
    return response.logs;
  } catch (error) {
    // Return mock data if API fails (when mock data is enabled)
    const shouldUseMock = getGlobalMockDataEnabled() || config.dev.allowMockData;
    if (shouldUseMock) {
      if (config.isDevelopment) {
        console.warn('Failed to fetch activity logs, using mock data:', error);
      }
      return mockLogs;
    }
    // If mock data is disabled, return empty array
    return [];
  }
};

// Fetch storage usage
export const fetchStorageUsage = async (): Promise<StorageUsage> => {
  const mockUsage: StorageUsage = {
    total: 10 * 1024 * 1024 * 1024, // 10 GB
    used: 2.4 * 1024 * 1024 * 1024, // 2.4 GB
    memories: 1.2 * 1024 * 1024 * 1024, // 1.2 GB
    attachments: 1.2 * 1024 * 1024 * 1024, // 1.2 GB
  };

  try {
    const response = await fetchJson<{ usage: StorageUsage }>(
      '/api/user/storage',
      undefined,
      {
        useMockData: getGlobalMockDataEnabled() || config.dev.allowMockData,
        mockData: { usage: mockUsage },
      }
    );
    return response.usage;
  } catch (error) {
    // Return mock data if API fails (when mock data is enabled)
    const shouldUseMock = getGlobalMockDataEnabled() || config.dev.allowMockData;
    if (shouldUseMock) {
      if (config.isDevelopment) {
        console.warn('Failed to fetch storage usage, using mock data:', error);
      }
      return mockUsage;
    }
    // If mock data is disabled, return zero usage
    return {
      total: 0,
      used: 0,
      memories: 0,
      attachments: 0,
    };
  }
};

// Export user data
export const exportUserData = async (format: 'json' | 'csv'): Promise<Blob> => {
  const response = await fetch(`/api/user/export?format=${format}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  return response.blob();
};

// Delete user account
export const deleteUserAccount = async (): Promise<void> => {
  const response = await fetchJson('/api/user/delete', {
    method: 'DELETE',
  });
  
  // Also sign out from Supabase
  await supabase.auth.signOut();
  
  return response;
};

// Change password
export const changePassword = async (newPassword: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
};

