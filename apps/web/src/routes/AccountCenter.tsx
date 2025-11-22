import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Mail, Shield, CreditCard, Activity, Download, Trash2, 
  Save, Edit2, Camera, Bell, Lock, Eye, EyeOff, Key, FileText,
  Calendar, HardDrive, AlertTriangle, CheckCircle2, X
} from 'lucide-react';
import { useAuth } from '../lib/supabase';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { Button } from '../components/ui/button';

type Tab = 'profile' | 'subscription' | 'billing' | 'privacy' | 'activity' | 'data';

export default function AccountCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Profile state
  const [profile, setProfile] = useState({
    name: user?.user_metadata?.full_name || '',
    bio: '',
    avatar: user?.user_metadata?.avatar_url || '',
  });

  // Privacy settings state
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: 'private',
    showEmail: false,
    allowDataSharing: false,
    twoFactorEnabled: false,
  });

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'subscription' as Tab, label: 'Subscription', icon: CreditCard },
    { id: 'billing' as Tab, label: 'Billing', icon: FileText },
    { id: 'privacy' as Tab, label: 'Privacy & Security', icon: Shield },
    { id: 'activity' as Tab, label: 'Activity', icon: Activity },
    { id: 'data' as Tab, label: 'Data & Export', icon: Download },
  ];

  const handleSaveProfile = async () => {
    // TODO: Save profile to backend
    setIsEditing(false);
  };

  const handleDeleteAccount = async () => {
    // TODO: Delete account
    alert('Account deletion feature coming soon');
    setShowDeleteConfirm(false);
  };

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
          <p className="text-white/60">Manage your account settings, subscription, and preferences</p>
        </div>

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

            {/* Account Stats Card */}
            <div className="mt-6 rounded-2xl border border-border/60 bg-gradient-to-br from-purple-900/20 to-pink-900/20 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">{profile.name || 'User'}</p>
                  <p className="text-xs text-white/60">{user?.email}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-white/70">
                  <span>Member since</span>
                  <span className="text-white">Jan 2024</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Status</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Active
                  </span>
                </div>
              </div>
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
                  {!isEditing && (
                    <Button onClick={() => setIsEditing(true)} variant="outline">
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Profile
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
                    <p className="text-white/60 text-sm">{user?.email}</p>
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
                      <label className="block text-sm font-medium text-white/80 mb-2">Bio</label>
                      <textarea
                        value={profile.bio}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        className="w-full rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 focus:outline-none focus:border-primary/50 resize-none h-24"
                        placeholder="Tell us about yourself..."
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={handleSaveProfile} className="bg-gradient-to-r from-purple-500 to-pink-500">
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button onClick={() => setIsEditing(false)} variant="outline">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Email</label>
                      <div className="rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2">
                        {user?.email}
                      </div>
                      <p className="text-xs text-white/40 mt-1">Email cannot be changed</p>
                    </div>
                    {profile.bio && (
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-2">Bio</label>
                        <div className="rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2">
                          {profile.bio || 'No bio set'}
                        </div>
                      </div>
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
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-8 rounded bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">•••• •••• •••• 4242</p>
                      <p className="text-sm text-white/60">Expires 12/25</p>
                    </div>
                  </div>
                </div>

                {/* Billing History */}
                <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Billing History</h3>
                  <div className="space-y-3">
                    {[
                      { date: 'Jan 15, 2024', amount: '$29.99', status: 'Paid' },
                      { date: 'Dec 15, 2023', amount: '$29.99', status: 'Paid' },
                      { date: 'Nov 15, 2023', amount: '$29.99', status: 'Paid' },
                    ].map((invoice, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-border/60">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-white/60" />
                          <div>
                            <p className="text-white font-medium">{invoice.date}</p>
                            <p className="text-xs text-white/60">Monthly Subscription</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white font-semibold">{invoice.amount}</span>
                          <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                            {invoice.status}
                          </span>
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
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
                            onChange={(e) => setPrivacySettings({ ...privacySettings, twoFactorEnabled: e.target.checked })}
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
                        <Button variant="outline" size="sm">
                          <Key className="h-4 w-4 mr-2" />
                          Change Password
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Privacy Settings */}
                  <div className="rounded-xl border border-border/60 bg-white/5 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Privacy Settings
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Profile Visibility</p>
                          <p className="text-sm text-white/60">Who can see your profile</p>
                        </div>
                        <select
                          value={privacySettings.profileVisibility}
                          onChange={(e) => setPrivacySettings({ ...privacySettings, profileVisibility: e.target.value })}
                          className="rounded-lg bg-black/40 border border-border/60 text-white px-4 py-2 focus:outline-none focus:border-primary/50"
                        >
                          <option value="private">Private</option>
                          <option value="public">Public</option>
                          <option value="friends">Friends Only</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Show Email</p>
                          <p className="text-sm text-white/60">Display your email on your profile</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={privacySettings.showEmail}
                            onChange={(e) => setPrivacySettings({ ...privacySettings, showEmail: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Activity Tab */}
            {activeTab === 'activity' && (
              <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Account Activity</h2>
                  <p className="text-white/60">View your recent account activity and login history</p>
                </div>

                <div className="space-y-3">
                  {[
                    { action: 'Login', location: 'San Francisco, CA', time: '2 hours ago', device: 'Chrome on MacOS' },
                    { action: 'Password Changed', location: 'San Francisco, CA', time: '5 days ago', device: 'Chrome on MacOS' },
                    { action: 'Login', location: 'New York, NY', time: '1 week ago', device: 'Safari on iPhone' },
                    { action: 'Subscription Updated', location: 'San Francisco, CA', time: '2 weeks ago', device: 'Chrome on MacOS' },
                  ].map((activity, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-white/5">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">{activity.action}</p>
                        <p className="text-sm text-white/60">{activity.location} • {activity.device}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white/80">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                    <Button variant="outline" className="justify-start">
                      <FileText className="h-4 w-4 mr-2" />
                      Export as JSON
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <FileText className="h-4 w-4 mr-2" />
                      Export as CSV
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
                      <p className="text-sm text-white/60">2.4 GB of 10 GB used</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                    <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full" style={{ width: '24%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>Memories: 1.2 GB</span>
                    <span>Attachments: 1.2 GB</span>
                  </div>
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
                        >
                          Yes, Delete My Account
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
