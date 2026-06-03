import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Mail, Shield, CreditCard, Activity, Download, Trash2,
  Save, Edit2, Camera, Lock, Key, FileText,
  Calendar, HardDrive, AlertTriangle, CheckCircle2, X, Loader2, LogIn, LogOut, Sparkles, Phone, Link2, Globe,
} from 'lucide-react';
import { useAuth, supabase } from '../lib/supabase';
import { ActivityTab } from '../components/account/ActivityTab';
import { useGuest } from '../contexts/GuestContext';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { MockDataToggle } from '../components/settings/MockDataToggle';
import { Button } from '../components/ui/button';
import { useMockData } from '../contexts/MockDataContext';
import {
  fetchUserProfile,
  updateUserProfile,
  fetchPrivacySettings,
  updatePrivacySettings,
  fetchActivityLogs,
  fetchStorageUsage,
  fetchPaymentMethods,
  fetchBillingHistory,
  exportUserData,
  deleteUserAccount,
  changePassword,
  logActivity,
  type ActivityLog,
  type StorageUsage,
  type PaymentMethod,
  type BillingInvoice,
} from '../api/user';

type Tab = 'profile' | 'subscription' | 'billing' | 'privacy' | 'activity' | 'data';

/** Get email from Supabase user (email, user_metadata, or identities). */
function getDisplayEmail(user: { email?: string | null; user_metadata?: { email?: string }; identities?: Array<{ identity_data?: { email?: string } }> } | null): string {
  if (!user) return '';
  const fromEmail = user.email?.trim();
  if (fromEmail) return fromEmail;
  const fromMeta = user.user_metadata?.email?.trim();
  if (fromMeta) return fromMeta;
  const fromIdentity = user.identities?.[0]?.identity_data?.email?.trim();
  return fromIdentity ?? '';
}

export default function AccountCenter() {
  const { user } = useAuth();
  const { isGuest, guestState, endGuestSession } = useGuest();
  const { useMockData: isMockDataEnabled } = useMockData();
  const navigate = useNavigate();
  const displayEmail = getDisplayEmail(user);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Profile state (no bio — the app is for telling your story)
  const [profile, setProfile] = useState({
    name: user?.user_metadata?.full_name || '',
    avatar: user?.user_metadata?.avatar_url || '',
    phone: user?.user_metadata?.phone || '',
  });

  // Privacy settings state
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: 'private' as 'private' | 'public' | 'friends',
    showEmail: false,
    allowDataSharing: false,
    twoFactorEnabled: false,
  });

  // Activity logs and storage
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [billingHistory, setBillingHistory] = useState<BillingInvoice[]>([]);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState(false);

  // Load initial data
  useEffect(() => {
    // Check if we're in dev mode with auth disabled (similar to AuthGate)
    const DEV_DISABLE_AUTH = import.meta.env.DEV && import.meta.env.VITE_DISABLE_AUTH === 'true';
    
    // Load account data if user is authenticated (not guest) OR if auth is disabled in dev
    if ((user && !isGuest) || DEV_DISABLE_AUTH) {
      loadAccountData();
    } else {
      // If guest or no user, just set loading to false
      setLoading(false);
    }
  }, [user, isGuest, isMockDataEnabled]);

  const loadAccountData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const [profileData, privacyData, activityData, storageData, paymentData, billingData] = await Promise.all([
        fetchUserProfile().catch(() => null),
        fetchPrivacySettings().catch(() => null),
        fetchActivityLogs().catch(() => null),
        fetchStorageUsage().catch(() => null),
        fetchPaymentMethods().catch(() => []),
        fetchBillingHistory().catch(() => []),
      ]);

      if (profileData) {
        setProfile(prev => ({
          ...prev,
          name: profileData.name || '',
          avatar: profileData.avatar_url || '',
          phone: profileData.phone ?? prev.phone ?? '',
        }));
      }

      if (privacyData) {
        setPrivacySettings(privacyData);
      }

      if (activityData) {
        setActivityLogs(activityData);
      }

      if (storageData) {
        setStorageUsage(storageData);
      }

      if (paymentData) {
        setPaymentMethods(paymentData);
      }

      if (billingData) {
        setBillingHistory(billingData);
      }
    } catch (err: any) {
      console.error('Failed to load account data:', err);
      setError(err.message || 'Failed to load account data');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'subscription' as Tab, label: 'Subscription', icon: CreditCard },
    { id: 'billing' as Tab, label: 'Billing', icon: FileText },
    { id: 'privacy' as Tab, label: 'Privacy & Security', icon: Shield },
    { id: 'activity' as Tab, label: 'Activity', icon: Activity },
    { id: 'data' as Tab, label: 'Data & Export', icon: Download },
  ];

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateUserProfile({
        name: profile.name,
        avatar_url: profile.avatar,
        phone: profile.phone || undefined,
      });
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you absolutely sure? This action cannot be undone. All your data will be permanently deleted.')) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await deleteUserAccount();
      // Redirect to login after deletion
      navigate('/login');
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      setError(err.message || 'Failed to delete account. Please try again.');
      setSaving(false);
    }
  };

  const handleSavePrivacySettings = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePrivacySettings(privacySettings);
      setSuccess('Privacy settings updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to save privacy settings:', err);
      setError(err.message || 'Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setChangingPassword(true);
    setError(null);
    setSuccess(null);
    try {
      await changePassword(newPassword);
      setSuccess('Password changed successfully!');
      setNewPassword('');
      setShowPasswordForm(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to change password:', err);
      setError(err.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingProvider(true);
    setError(null);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/account` },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to link Google account.');
      setLinkingProvider(false);
    }
  };

  const handleLogout = async () => {
    if (user) {
      await supabase.auth.signOut();
    }
    if (isGuest) {
      endGuestSession();
    }
    navigate('/login');
  };

  const handleExportData = async (format: 'json' | 'csv') => {
    setSaving(true);
    setError(null);
    try {
      const blob = await exportUserData(format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lorebook-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSuccess(`Data exported as ${format.toUpperCase()} successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to export data:', err);
      setError(err.message || 'Failed to export data');
    } finally {
      setSaving(false);
    }
  };

  // Show guest account page
  if (isGuest && !user) {
    const messagesRemaining = guestState?.chatLimit ? guestState.chatLimit - (guestState.chatMessagesUsed || 0) : 0;
    const limitReached = messagesRemaining <= 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/')}
              className="text-white/60 hover:text-white mb-4 flex items-center gap-2 transition"
            >
              ← Back to App
            </button>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Account Center
            </h1>
            <p className="text-white/60">Manage your account settings, subscription, and preferences</p>
          </div>

          {/* Guest Account Card */}
          <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-yellow-500/5 to-transparent backdrop-blur-sm p-8">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                <User className="h-8 w-8 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-white">Guest Account</h2>
                  <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-300 text-xs font-medium border border-yellow-500/30">
                    Limited Access
                  </span>
                </div>
                <p className="text-white/70 mb-6">
                  You're currently using Lore Book as a guest. Guest accounts have limited features and data is stored locally in your browser.
                </p>

                {/* Guest Account Info */}
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-5 w-5 text-yellow-400" />
                      <h3 className="text-sm font-semibold text-white">Chat Messages</h3>
                    </div>
                    <p className="text-2xl font-bold text-white mb-1">
                      {limitReached ? '0' : messagesRemaining} / {guestState?.chatLimit || 5}
                    </p>
                    <p className="text-xs text-white/60">
                      {limitReached ? 'Limit reached' : 'Messages remaining'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-yellow-400" />
                      <h3 className="text-sm font-semibold text-white">Session</h3>
                    </div>
                    <p className="text-sm font-medium text-white mb-1">
                      {guestState?.createdAt 
                        ? new Date(guestState.createdAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Active'}
                    </p>
                    <p className="text-xs text-white/60">Guest session expires in 24 hours</p>
                  </div>
                </div>

                {/* Limitations */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    Guest Account Limitations
                  </h3>
                  <ul className="space-y-3 text-white/70">
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Limited Chat Messages</p>
                        <p className="text-sm text-white/50">Only {guestState?.chatLimit || 5} chat messages per session</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">No Cloud Sync</p>
                        <p className="text-sm text-white/50">Data is stored locally and may be lost if you clear your browser</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">No Account Management</p>
                        <p className="text-sm text-white/50">Cannot access profile settings, subscriptions, or data export</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Temporary Session</p>
                        <p className="text-sm text-white/50">Guest sessions expire after 24 hours</p>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Sign Up CTA */}
                <div className="rounded-xl border border-primary/50 bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-2">Unlock Full Access</h3>
                      <p className="text-white/80 mb-4">
                        Sign up for a free account to unlock unlimited chat messages, cloud sync, full account management, and all premium features.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={() => navigate('/login')}
                          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                        >
                          <LogIn className="h-4 w-4 mr-2" />
                          Sign Up for Free
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => navigate('/')}
                        >
                          Continue as Guest
                        </Button>
                        <Button
                          variant="outline"
                          className="border-white/30 text-white/80 hover:bg-white/10"
                          onClick={() => {
                            endGuestSession();
                            navigate('/login');
                          }}
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          End guest session
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if we're in dev mode with auth disabled
  const DEV_DISABLE_AUTH = import.meta.env.DEV && import.meta.env.VITE_DISABLE_AUTH === 'true';
  
  if (loading && !user && !DEV_DISABLE_AUTH && !isGuest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/60">Loading account data...</p>
        </div>
      </div>
    );
  }

  // Show dev mode notice if auth is disabled and no user
  const showDevModeNotice = DEV_DISABLE_AUTH && !user && !isGuest;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-white/60 hover:text-white mb-4 flex items-center gap-2 transition"
          >
            ← Back to App
          </button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            Account Center
          </h1>
          <p className="text-white/60">
            {displayEmail ? (
              <>Logged in as <span className="text-white/80">{displayEmail}</span></>
            ) : (
              'Manage your account settings, subscription, and preferences'
            )}
          </p>
        </div>

        {/* Dev Mode Notice */}
        {showDevModeNotice && (
          <div className="mb-6 rounded-lg bg-yellow-500/20 border border-yellow-500/50 p-4 text-yellow-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="font-medium">Development Mode</p>
                <p className="text-sm text-yellow-200/80">Authentication is disabled. Some features may be limited.</p>
              </div>
            </div>
            <button onClick={() => navigate('/login')} className="text-yellow-400 hover:text-yellow-300 underline text-sm">
              Sign In
            </button>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-200 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-lg bg-green-500/20 border border-green-500/50 p-4 text-green-200 flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-primary/50 text-white'
                        : 'text-white/70 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Account Stats Card - Email, Phone, Log out */}
            <div className="mt-6 rounded-2xl border border-border/60 bg-gradient-to-br from-purple-900/20 to-pink-900/20 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">{profile.name || displayEmail || 'Guest User'}</p>
                  <p className="text-xs text-white/60">{displayEmail || (showDevModeNotice ? 'Dev Mode' : 'Not signed in')}</p>
                </div>
              </div>
              {user && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-white/80">
                    <Mail className="h-4 w-4 text-white/60 flex-shrink-0" />
                    <span className="truncate" title={displayEmail}>{displayEmail || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/80">
                    <Phone className="h-4 w-4 text-white/60 flex-shrink-0" />
                    <span>{profile.phone || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between text-white/70 pt-1">
                    <span>Member since</span>
                    <span className="text-white">
                      {user.created_at 
                        ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>Status</span>
                    <span className="text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                  </div>
                </div>
              )}
              {/* Log out / End session / Sign in - always visible so all users can log out */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 border-white/30 text-white/90 hover:bg-white/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {user ? 'Log out' : isGuest ? 'End guest session' : 'Sign in'}
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Profile Settings</h2>
                    <p className="text-white/60">Update your personal information and preferences</p>
                  </div>
                  {!isEditing && user && (
                    <Button onClick={() => setIsEditing(true)} variant="outline">
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  )}
                  {!user && !isGuest && (
                    <Button onClick={() => navigate('/login')} variant="outline">
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In to Edit
                    </Button>
                  )}
                </div>

                {/* Avatar Section */}
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl font-bold text-white">
                      {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    {isEditing && (
                      <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary border-2 border-black flex items-center justify-center hover:bg-primary/80 transition">
                        <Camera className="h-4 w-4 text-white" />
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-semibold">{profile.name || 'Your Name'}</p>
                    <p className="text-white/60 text-sm">{displayEmail || '—'}</p>
                    {isEditing && (
                      <p className="text-xs text-white/40 mt-1">Click avatar to change photo</p>
                    )}
                  </div>
                </div>

                {/* Profile Form */}
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Display Name</label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="w-full rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 focus:outline-none focus:border-primary/50"
                        placeholder="Enter your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Phone</label>
                      <input
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="w-full rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 focus:outline-none focus:border-primary/50"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        onClick={handleSaveProfile} 
                        className="bg-gradient-to-r from-purple-500 to-pink-500"
                        disabled={saving}
                      >
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                      <Button 
                        onClick={() => {
                          setIsEditing(false);
                          setError(null);
                          // Reload profile data to reset changes
                          loadAccountData();
                        }} 
                        variant="outline"
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Email</label>
                      <div className="rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 flex items-center gap-2">
                        <Mail className="h-4 w-4 text-white/50" />
                        {displayEmail || '—'}
                      </div>
                      <p className="text-xs text-white/40 mt-1">Email cannot be changed</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Phone</label>
                      <div className="rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 flex items-center gap-2">
                        <Phone className="h-4 w-4 text-white/50" />
                        {profile.phone || 'Not set'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Connected Accounts */}
                {user && (
                  <div className="pt-6 border-t border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-purple-400" />
                      Connected Accounts
                    </h3>
                    <p className="text-sm text-white/50 mb-4">
                      Link multiple sign-in methods to the same account. If you used the same email with both Email and Google, connecting them here merges them into one account.
                    </p>
                    <div className="space-y-3">
                      {/* Email / Magic Link */}
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-blue-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Email / Magic Link</p>
                            <p className="text-xs text-white/40">{displayEmail || '—'}</p>
                          </div>
                        </div>
                        {user.identities?.some((id: { provider: string }) => id.provider === 'email') ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                          </span>
                        ) : (
                          <span className="text-xs text-white/30">Not connected</span>
                        )}
                      </div>

                      {/* Google OAuth */}
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                            <Globe className="h-4 w-4 text-red-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Google</p>
                            <p className="text-xs text-white/40">Sign in with your Google account</p>
                          </div>
                        </div>
                        {user.identities?.some((id: { provider: string }) => id.provider === 'google') ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleLinkGoogle}
                            disabled={linkingProvider}
                            className="text-xs px-3 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {linkingProvider ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Connecting…</>
                            ) : (
                              <><Link2 className="h-3 w-3" /> Connect Google</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {user.identities && user.identities.length > 1 && (
                      <p className="text-xs text-green-400/70 mt-3 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Your accounts are linked — you can sign in with either method.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Subscription Tab */}
            {activeTab === 'subscription' && (
              <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-1">Subscription Management</h2>
                  <p className="text-white/60">Manage your plan, billing, and subscription settings</p>
                </div>
                <SubscriptionManagement />
              </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
              <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Billing & Payment</h2>
                  <p className="text-white/60">Manage your payment methods and billing history</p>
                </div>

                {/* Payment Method */}
                <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Payment Method</h3>
                    <Button variant="outline" size="sm">
                      <Edit2 className="h-4 w-4 mr-2" />
                      Update
                    </Button>
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : paymentMethods.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      <CreditCard className="h-12 w-12 mx-auto mb-4 text-white/40" />
                      <p>No payment methods on file</p>
                      {isMockDataEnabled && (
                        <p className="text-xs text-yellow-400/80 mt-2">Mock data toggle is enabled</p>
                      )}
                    </div>
                  ) : (
                    paymentMethods.map((method) => (
                      <div key={method.id} className="flex items-center gap-4">
                        <div className="w-12 h-8 rounded bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                          <CreditCard className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            •••• •••• •••• {method.last4}
                            {isMockDataEnabled && (
                              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
                                Demo
                              </span>
                            )}
                          </p>
                          {method.expiryMonth && method.expiryYear && (
                            <p className="text-sm text-white/60">
                              Expires {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear.toString().slice(-2)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Billing History */}
                <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Billing History</h3>
                    {isMockDataEnabled && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
                        Demo Data
                      </span>
                    )}
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : billingHistory.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-white/40" />
                      <p>No billing history available</p>
                      {isMockDataEnabled && (
                        <p className="text-xs text-yellow-400/80 mt-2">Mock data toggle is enabled</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {billingHistory.map((invoice) => {
                        const invoiceDate = new Date(invoice.date);
                        const formattedDate = invoiceDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        });
                        const formattedAmount = new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: invoice.currency.toUpperCase(),
                        }).format(invoice.amount);

                        const getStatusColor = (status: string) => {
                          switch (status) {
                            case 'paid':
                              return 'bg-green-500/20 text-green-400';
                            case 'pending':
                              return 'bg-yellow-500/20 text-yellow-400';
                            case 'failed':
                              return 'bg-red-500/20 text-red-400';
                            case 'refunded':
                              return 'bg-blue-500/20 text-blue-400';
                            default:
                              return 'bg-white/10 text-white/60';
                          }
                        };

                        return (
                          <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-border/60">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-white/60" />
                              <div>
                                <p className="text-white font-medium">{formattedDate}</p>
                                <p className="text-xs text-white/60">{invoice.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-white font-semibold">{formattedAmount}</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(invoice.status)}`}>
                                {invoice.status}
                              </span>
                              {invoice.invoiceUrl && (
                                <Button variant="ghost" size="sm" onClick={() => window.open(invoice.invoiceUrl, '_blank')}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Privacy & Security Tab */}
            {activeTab === 'privacy' && (
              <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Privacy & Security</h2>
                  <p className="text-white/60">Control your privacy settings and security preferences</p>
                </div>

                {/* Security Settings */}
                <div className="space-y-4">
                  <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Security Settings
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Two-Factor Authentication</p>
                          <p className="text-sm text-white/60">Add an extra layer of security to your account</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={privacySettings.twoFactorEnabled}
                            onChange={async (e) => {
                              const newSettings = { ...privacySettings, twoFactorEnabled: e.target.checked };
                              setPrivacySettings(newSettings);
                              // Auto-save on change
                              try {
                                await updatePrivacySettings(newSettings);
                              } catch (err: any) {
                                console.error('Failed to save privacy settings:', err);
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Password</p>
                          <p className="text-sm text-white/60">Last changed 30 days ago</p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowPasswordForm(!showPasswordForm)}
                        >
                          <Key className="h-4 w-4 mr-2" />
                          Change Password
                        </Button>
                      </div>
                      {showPasswordForm && (
                        <div className="mt-4 p-4 rounded-lg bg-black/40 border border-border/60 space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-white/80 mb-2">New Password</label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 focus:outline-none focus:border-primary/50"
                              placeholder="Enter new password (min 8 characters)"
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button
                              onClick={handleChangePassword}
                              disabled={changingPassword || !newPassword || newPassword.length < 8}
                              className="bg-gradient-to-r from-purple-500 to-pink-500"
                              size="sm"
                            >
                              {changingPassword ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Changing...
                                </>
                              ) : (
                                'Change Password'
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowPasswordForm(false);
                                setNewPassword('');
                                setError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Privacy Settings */}
                  <div className="rounded-xl border border-green-500/60 bg-green-500/10 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-green-400" />
                      Privacy & Security
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 bg-black/40 rounded-lg border border-green-500/30">
                        <Shield className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-white font-semibold mb-1">Your Lore Book is 100% Private</p>
                          <p className="text-sm text-white/70">
                            Everything you share is private to you only. Your memories, conversations, and data are encrypted and secure. 
                            No one else can see your content unless you explicitly choose to publish it in the future.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-4 bg-black/40 rounded-lg border border-primary/30">
                        <Lock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-white font-semibold mb-1">Like ChatGPT - Private by Default</p>
                          <p className="text-sm text-white/70">
                            Just like ChatGPT, your conversations and data are completely private. We never share, sell, or expose your personal information.
                            Any future social features will be opt-in only.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Activity Tab */}
            {activeTab === 'activity' && (
              <ActivityTab
                logs={activityLogs}
                loading={loading}
                user={user}
                onRefresh={async () => {
                  const data = await fetchActivityLogs().catch(() => null);
                  if (data) setActivityLogs(data);
                }}
                onLogEvent={async (action) => {
                  await logActivity(action);
                  const data = await fetchActivityLogs().catch(() => null);
                  if (data) setActivityLogs(data);
                }}
              />
            )}

            {/* Data & Export Tab */}
            {activeTab === 'data' && (
              <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Data & Export</h2>
                  <p className="text-white/60">Export your data or manage your account storage</p>
                </div>

                {/* Data Export */}
                <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Download className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">Export Your Data</h3>
                      <p className="text-sm text-white/60">Download all your memories, entries, and account data</p>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Button 
                      variant="outline" 
                      className="justify-start"
                      onClick={() => handleExportData('json')}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as JSON
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start"
                      onClick={() => handleExportData('csv')}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as CSV
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Storage Info */}
                <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <HardDrive className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">Storage Usage</h3>
                      <p className="text-sm text-white/60">
                        {storageUsage 
                          ? `${(storageUsage.used / (1024 * 1024 * 1024)).toFixed(1)} GB of ${(storageUsage.total / (1024 * 1024 * 1024)).toFixed(0)} GB used`
                          : 'Loading...'}
                      </p>
                    </div>
                  </div>
                  {storageUsage && (
                    <>
                      <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all" 
                          style={{ width: `${(storageUsage.used / storageUsage.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-white/60">
                        <span>Memories: {(storageUsage.memories / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                        <span>Attachments: {(storageUsage.attachments / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Mock Data Toggle - Only for demo/guest; hidden when logged into your own account */}
                {(!user || isGuest) && (
                  <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">Data Source (Demo)</h3>
                        <p className="text-sm text-white/60">Preview with mock data. Log in to use your real data.</p>
                      </div>
                    </div>
                    <MockDataToggle />
                  </div>
                )}

                {/* Ownership & Safety */}
                <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div id="ownership" className="sr-only">Ownership</div>
                      <p className="text-xs uppercase text-white/50">Account</p>
                      <h3 className="text-lg font-semibold text-white">Ownership & Safety</h3>
                      <p className="text-xs text-white/60">Export or irreversibly delete your LoreBook data.</p>
                    </div>
                  </div>
                  <p className="mb-4 text-xs text-white/60">
                    Need a copy first? <a className="underline hover:text-white transition-colors" href="/api/account/export">Download your JSON export.</a>
                  </p>
                </div>

                {/* Danger Zone */}
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
                  </div>
                  <p className="text-white/70 mb-4 text-sm">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  {!showDeleteConfirm ? (
                    <Button
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-white font-medium">Are you absolutely sure?</p>
                      <div className="flex gap-3">
                        <Button
                          onClick={handleDeleteAccount}
                          className="bg-red-500 hover:bg-red-600"
                          disabled={saving}
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            'Yes, Delete My Account'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
