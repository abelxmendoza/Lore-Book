import { config } from '../config/env';
import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';
import { fetchJson } from '../lib/api';
import { supabase } from '../lib/supabase';

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

export type PaymentMethod = {
  id: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
};

export type BillingInvoice = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  description: string;
  invoiceUrl?: string;
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
  } catch (_error) {
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
  } catch (_error) {
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
  } catch (_error) {
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
  } catch (_error) {
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
  } catch (_error) {
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

// Fetch payment methods
export const fetchPaymentMethods = async (): Promise<PaymentMethod[]> => {
  const mockPaymentMethods: PaymentMethod[] = [
    {
      id: 'pm_mock_1',
      type: 'card',
      last4: '4242',
      brand: 'visa',
      expiryMonth: 12,
      expiryYear: 2025,
      isDefault: true,
    },
  ];

  try {
    const response = await fetchJson<{ paymentMethods: PaymentMethod[] }>(
      '/api/user/payment-methods',
      undefined,
      {
        useMockData: getGlobalMockDataEnabled() || config.dev.allowMockData,
        mockData: { paymentMethods: mockPaymentMethods },
      }
    );
    return response.paymentMethods;
  } catch (_error) {
    const shouldUseMock = getGlobalMockDataEnabled() || config.dev.allowMockData;
    if (shouldUseMock) {
      if (config.isDevelopment) {
        console.warn('Failed to fetch payment methods, using mock data:', error);
      }
      return mockPaymentMethods;
    }
    return [];
  }
};

// Fetch billing history
export const fetchBillingHistory = async (limit: number = 50): Promise<BillingInvoice[]> => {
  const mockInvoices: BillingInvoice[] = [
    {
      id: 'inv_mock_1',
      date: '2024-01-15',
      amount: 29.99,
      currency: 'usd',
      status: 'paid',
      description: 'Monthly Subscription',
    },
    {
      id: 'inv_mock_2',
      date: '2023-12-15',
      amount: 29.99,
      currency: 'usd',
      status: 'paid',
      description: 'Monthly Subscription',
    },
    {
      id: 'inv_mock_3',
      date: '2023-11-15',
      amount: 29.99,
      currency: 'usd',
      status: 'paid',
      description: 'Monthly Subscription',
    },
  ];

  try {
    const response = await fetchJson<{ invoices: BillingInvoice[] }>(
      `/api/user/billing-history?limit=${limit}`,
      undefined,
      {
        useMockData: getGlobalMockDataEnabled() || config.dev.allowMockData,
        mockData: { invoices: mockInvoices },
      }
    );
    return response.invoices;
  } catch (_error) {
    const shouldUseMock = getGlobalMockDataEnabled() || config.dev.allowMockData;
    if (shouldUseMock) {
      if (config.isDevelopment) {
        console.warn('Failed to fetch billing history, using mock data:', error);
      }
      return mockInvoices;
    }
    return [];
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

