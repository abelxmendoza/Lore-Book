import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Shield, Activity, Download, Trash2,
  Save, Lock, FileText,
  AlertTriangle, CheckCircle2, Loader2, LogOut,
  Sparkles, Link2, ChevronRight, X,
} from 'lucide-react';
import { useAuth, supabase } from '../lib/supabase';
import { ActivityTab } from '../components/account/ActivityTab';
import { useGuest } from '../contexts/GuestContext';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { isAdmin } from '../middleware/roleGuard';
import {
  fetchUserProfile,
  updateUserProfile,
  fetchPrivacySettings,
  updatePrivacySettings,
  fetchActivityLogs,
  fetchStorageUsage,
  exportUserData,
  deleteUserAccount,
  changePassword,
  type ActivityLog,
  type StorageUsage,
} from '../api/user';

type Tab = 'profile' | 'subscription' | 'privacy' | 'activity' | 'data';

function getDisplayEmail(user: any): string {
  return user?.email?.trim()
    || user?.user_metadata?.email?.trim()
    || user?.identities?.[0]?.identity_data?.email?.trim()
    || '';
}

function getAvatarInitial(name: string, email: string): string {
  const n = name || email || '?';
  return n.charAt(0).toUpperCase();
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  label, icon: Icon, active, onClick,
}: {
  id?: Tab; label: string; icon: any; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
        active
          ? 'bg-primary/15 text-primary border border-primary/25'
          : 'text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      {active && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-50" />}
    </button>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30">
      {title && (
        <div className="px-5 pt-5 pb-3 border-b border-white/8">
          <p className="text-sm font-semibold text-white/60 uppercase tracking-wider">{title}</p>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
      <div>
        <p className="text-sm text-white/80">{label}</p>
        {description && <p className="text-xs text-white/35 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-white/15'}`}
        style={{ height: '22px' }}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountCenter() {
  const { user } = useAuth();
  const { isGuest, guestState, endGuestSession } = useGuest();
  const navigate = useNavigate();

  const displayEmail = getDisplayEmail(user);
  const userIsAdmin = isAdmin(user);

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPasswordForm, setShowPasswordForm]   = useState(false);
  const [changingPassword, setChangingPassword]   = useState(false);
  const [linkingProvider, setLinkingProvider]     = useState(false);
  const [newPassword, setNewPassword]             = useState('');

  const [profile, setProfile] = useState({
    name: user?.user_metadata?.full_name || '',
    avatar: user?.user_metadata?.avatar_url || '',
    phone: user?.user_metadata?.phone || '',
  });

  const [privacy, setPrivacy] = useState({
    profileVisibility: 'private' as 'private' | 'public' | 'friends',
    showEmail: false,
    allowDataSharing: false,
    twoFactorEnabled: false,
  });

  const [activityLogs, setActivityLogs]   = useState<ActivityLog[]>([]);
  const [storageUsage, setStorageUsage]   = useState<StorageUsage | null>(null);

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else setError(msg);
  };

  useEffect(() => {
    if (user && !isGuest) {
      setLoading(true);
      Promise.all([
        fetchUserProfile().catch(() => null),
        fetchPrivacySettings().catch(() => null),
        fetchActivityLogs().catch(() => null),
        fetchStorageUsage().catch(() => null),
      ]).then(([profileData, privacyData, activityData, storageData]) => {
        if (profileData) setProfile(p => ({ ...p, name: profileData.name || '', avatar: profileData.avatar_url || '', phone: profileData.phone || '' }));
        if (privacyData) setPrivacy(privacyData);
        if (activityData) setActivityLogs(activityData);
        if (storageData) setStorageUsage(storageData);
      }).catch(console.error).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user, isGuest]);

  const handleSaveProfile = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      await updateUserProfile({ name: profile.name, avatar_url: profile.avatar, phone: profile.phone || undefined });
      notify('Profile saved.');
      setIsEditing(false);
    } catch (e: any) { notify(e.message || 'Failed to save.', 'error'); }
    finally { setSaving(false); }
  };

  const handleSavePrivacy = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      await updatePrivacySettings(privacy);
      notify('Privacy settings saved.');
    } catch (e: any) { notify(e.message || 'Failed to save.', 'error'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setChangingPassword(true); setError(null);
    try {
      await changePassword(newPassword);
      notify('Password changed.');
      setNewPassword(''); setShowPasswordForm(false);
    } catch (e: any) { notify(e.message || 'Failed to change password.', 'error'); }
    finally { setChangingPassword(false); }
  };

  const handleLinkGoogle = async () => {
    setLinkingProvider(true); setError(null);
    try {
      const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${window.location.origin}/account` } });
      if (error) throw error;
    } catch (e: any) { notify(e.message || 'Failed to link Google.', 'error'); setLinkingProvider(false); }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setSaving(true); setError(null);
    try {
      const blob = await exportUserData(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lorebook-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      notify(`Exported as ${format.toUpperCase()}.`);
    } catch (e: any) { notify(e.message || 'Export failed.', 'error'); }
    finally { setSaving(false); }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Delete your account permanently? This cannot be undone.')) return;
    setSaving(true); setError(null);
    try { await deleteUserAccount(); navigate('/login'); }
    catch (e: any) { notify(e.message || 'Failed to delete account.', 'error'); setSaving(false); }
  };

  const handleLogout = async () => {
    if (user) await supabase.auth.signOut();
    if (isGuest) endGuestSession();
    navigate('/login');
  };

  // ── Guest view ────────────────────────────────────────────────────────────

  if (isGuest && !user) {
    const messagesLeft = guestState?.chatLimit
      ? guestState.chatLimit - (guestState.chatMessagesUsed || 0)
      : 0;
    return (
      <div className="min-h-screen bg-[#080510] text-white">
        <div className="max-w-lg mx-auto px-4 py-14">
          <button onClick={() => navigate('/')} className="text-white/35 hover:text-white text-sm mb-8 transition flex items-center gap-1">
            ← Back
          </button>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/8 flex items-center justify-center mx-auto mb-5">
              <User className="h-8 w-8 text-white/40" />
            </div>
            <p className="text-lg font-bold text-white mb-1">Guest Session</p>
            <p className="text-sm text-white/40 mb-6">
              {messagesLeft > 0 ? `${messagesLeft} messages remaining` : 'Message limit reached'}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition mb-3"
            >
              Create a free account
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-2 rounded-xl border border-white/10 text-white/40 text-sm hover:text-white transition"
            >
              End session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080510] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-white/40 text-sm">Loading account…</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'profile',      label: 'Profile',          icon: User },
    { id: 'subscription', label: 'Subscription',     icon: Sparkles },
    { id: 'privacy',      label: 'Privacy',          icon: Shield },
    { id: 'activity',     label: 'Activity',         icon: Activity },
    { id: 'data',         label: 'Data & Export',    icon: Download },
  ];

  const providers = (user.identities || []).map((i: any) => i.provider as string);
  const hasGoogle = providers.includes('google');
  const userRole  = user.user_metadata?.role || user.app_metadata?.role;

  // ── Authenticated layout ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080510] text-white">

      {/* Subtle glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-primary/6 rounded-full blur-[120px] translate-x-1/4 -translate-y-1/3" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-10">

        {/* Page header — back button + user identity + sign out */}
        <div className="flex items-center gap-3 mb-8">
          {/* Back to app — visible button, not a text link */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/10 hover:text-white text-white/60 text-sm font-medium transition shrink-0"
          >
            ← App
          </button>

          {/* Avatar + name */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm select-none shrink-0">
              {getAvatarInitial(profile.name, displayEmail)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white truncate">{profile.name || displayEmail}</span>
                {userIsAdmin && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
                    Admin
                  </span>
                )}
                {userRole === 'developer' && !userIsAdmin && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25 shrink-0">
                    Dev
                  </span>
                )}
              </div>
              <p className="text-xs text-white/35 truncate">{displayEmail}</p>
            </div>
          </div>

          {/* Sign out */}
          <button
            type="button"
            onClick={handleLogout}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-medium transition shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>

        {/* Status banners */}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-400">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            <button type="button" onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Body: sidebar + content */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Mobile: horizontal scrollable tab pills */}
          <nav className="lg:hidden flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                    activeTab === t.id
                      ? 'bg-primary/15 text-primary border border-primary/25'
                      : 'text-white/45 hover:text-white/75 border border-white/8 bg-white/[0.03]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Desktop: vertical sidebar */}
          <nav className="hidden lg:flex lg:w-48 flex-shrink-0 lg:flex-col gap-1">
            {tabs.map(t => (
              <NavItem key={t.id} {...t} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} />
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-5">

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (

              <>
                {/* ── PROFILE ────────────────────────────────────────────── */}
                {activeTab === 'profile' && (
                  <div className="space-y-5">
                    <Section title="Basic Information">
                      <div className="space-y-4">
                        {/* Name */}
                        <div>
                          <label className="block text-xs text-white/40 mb-1.5">Display name</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={profile.name}
                              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                              placeholder="Your name"
                              className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                            />
                          ) : (
                            <p className="text-sm text-white">{profile.name || <span className="text-white/30">Not set</span>}</p>
                          )}
                        </div>

                        {/* Email (read-only) */}
                        <div>
                          <label className="block text-xs text-white/40 mb-1.5">Email</label>
                          <p className="text-sm text-white/70">{displayEmail}</p>
                          <p className="text-xs text-white/25 mt-0.5">Email is managed by your auth provider</p>
                        </div>

                        {/* Phone */}
                        <div>
                          <label className="block text-xs text-white/40 mb-1.5">Phone</label>
                          {isEditing ? (
                            <input
                              type="tel"
                              value={profile.phone}
                              onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                              placeholder="+1 (555) 000-0000"
                              className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                            />
                          ) : (
                            <p className="text-sm text-white">{profile.phone || <span className="text-white/30">Not set</span>}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-5 pt-4 border-t border-white/8">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSaveProfile}
                              disabled={saving}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition disabled:opacity-50"
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              Save
                            </button>
                            <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-sm hover:text-white transition">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 text-white/60 text-sm hover:text-white transition">
                            Edit profile
                          </button>
                        )}
                      </div>
                    </Section>

                    {/* Sign-in methods */}
                    <Section title="Sign-in Methods">
                      <div className="space-y-3">
                        {providers.map((p: string) => (
                          <div key={p} className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 text-sm">
                              {p === 'google'
                                ? <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                                : <Lock className="h-4 w-4 text-white/40" />}
                              <span className="capitalize text-white/70">{p === 'email' ? 'Email / Magic link' : 'Google'}</span>
                            </div>
                            <span className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded">Connected</span>
                          </div>
                        ))}
                        {!hasGoogle && (
                          <button
                            type="button"
                            onClick={handleLinkGoogle}
                            disabled={linkingProvider}
                            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition mt-1"
                          >
                            <Link2 className="h-4 w-4" />
                            {linkingProvider ? 'Linking…' : 'Link Google account'}
                          </button>
                        )}
                      </div>
                    </Section>

                    {/* Password */}
                    <Section title="Password">
                      {showPasswordForm ? (
                        <div className="space-y-3">
                          <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="New password (min 8 characters)"
                            className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleChangePassword}
                              disabled={changingPassword}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition disabled:opacity-50"
                            >
                              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Update password
                            </button>
                            <button type="button" onClick={() => setShowPasswordForm(false)} className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-sm hover:text-white transition">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowPasswordForm(true)}
                          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition"
                        >
                          <Lock className="h-4 w-4" />
                          Change password
                        </button>
                      )}
                    </Section>
                  </div>
                )}

                {/* ── SUBSCRIPTION ──────────────────────────────────────── */}
                {activeTab === 'subscription' && (
                  <SubscriptionManagement />
                )}

                {/* ── PRIVACY ───────────────────────────────────────────── */}
                {activeTab === 'privacy' && (
                  <div className="space-y-5">
                    <Section title="Visibility">
                      <div>
                        <label className="block text-xs text-white/40 mb-2">Profile visibility</label>
                        <select
                          value={privacy.profileVisibility}
                          onChange={e => setPrivacy(p => ({ ...p, profileVisibility: e.target.value as any }))}
                          className="bg-white/[0.05] border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                        >
                          <option value="private">Private — only you</option>
                          <option value="friends">Friends only</option>
                          <option value="public">Public</option>
                        </select>
                      </div>
                    </Section>

                    <Section title="Sharing">
                      <ToggleRow
                        label="Show email"
                        description="Allow others to see your email on your profile"
                        checked={privacy.showEmail}
                        onChange={v => setPrivacy(p => ({ ...p, showEmail: v }))}
                      />
                      <ToggleRow
                        label="Allow data sharing"
                        description="Help improve LoreBook by sharing anonymised usage patterns"
                        checked={privacy.allowDataSharing}
                        onChange={v => setPrivacy(p => ({ ...p, allowDataSharing: v }))}
                      />
                    </Section>

                    <Section title="Security">
                      <ToggleRow
                        label="Two-factor authentication"
                        description="Add an extra layer of security (coming soon)"
                        checked={privacy.twoFactorEnabled}
                        onChange={v => setPrivacy(p => ({ ...p, twoFactorEnabled: v }))}
                      />
                    </Section>

                    <button
                      type="button"
                      onClick={handleSavePrivacy}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save privacy settings
                    </button>
                  </div>
                )}

                {/* ── ACTIVITY ──────────────────────────────────────────── */}
                {activeTab === 'activity' && (
                  <Section>
                    <ActivityTab
                      logs={activityLogs}
                      loading={loading}
                      user={user ? { created_at: user.created_at } : null}
                      onRefresh={async () => { const data = await fetchActivityLogs().catch(() => null); if (data) setActivityLogs(data); }}
                      onLogEvent={async (_action: string) => {}}
                    />
                  </Section>
                )}

                {/* ── DATA & EXPORT ─────────────────────────────────────── */}
                {activeTab === 'data' && (
                  <div className="space-y-5">
                    {/* Storage */}
                    {storageUsage && (
                      <Section title="Storage">
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">Memories</span>
                            <span className="text-white tabular-nums">{storageUsage.memories.toLocaleString()} items</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">Attachments</span>
                            <span className="text-white tabular-nums">{storageUsage.attachments.toLocaleString()} items</span>
                          </div>
                          <div className="flex justify-between text-sm font-medium border-t border-white/8 pt-2 mt-1">
                            <span className="text-white/70">Total used</span>
                            <span className="text-white tabular-nums">{(storageUsage.used / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      </Section>
                    )}

                    {/* Export */}
                    <Section title="Export Your Data">
                      <p className="text-sm text-white/45 mb-4 leading-relaxed">
                        Download everything LoreBook has stored about you — memories, characters, timeline, conversations.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleExport('json')}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 text-white/70 text-sm hover:text-white hover:border-white/30 transition disabled:opacity-50"
                        >
                          <Download className="h-4 w-4" />
                          Export JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport('csv')}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 text-white/70 text-sm hover:text-white hover:border-white/30 transition disabled:opacity-50"
                        >
                          <FileText className="h-4 w-4" />
                          Export CSV
                        </button>
                      </div>
                    </Section>

                    {/* Delete account */}
                    <Section title="Danger Zone">
                      <p className="text-sm text-white/45 mb-4 leading-relaxed">
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                      {showDeleteConfirm ? (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-4 space-y-3">
                          <p className="text-sm text-red-300 font-medium">Are you absolutely sure?</p>
                          <p className="text-xs text-white/40">Your memories, characters, timeline, and all data will be permanently deleted.</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={handleDeleteAccount} disabled={saving} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition">
                              Yes, delete everything
                            </button>
                            <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-sm hover:text-white transition">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete my account
                        </button>
                      )}
                    </Section>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
