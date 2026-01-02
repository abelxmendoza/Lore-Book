import { useState, useEffect } from 'react';
import { Shield, Download, Trash2, AlertTriangle, Crown, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { fetchJson } from '../../lib/api';
import { announceToScreenReader } from '../../lib/accessibility';
import { PrivacyAssurance } from '../subscription/PrivacyAssurance';
import { useSubscription } from '../../hooks/useSubscription';

interface PrivacySettingsProps {
  onBack?: () => void;
}

type PrivacySettings = {
  dataRetentionDays: number;
  allowAnalytics: boolean;
  allowDataSharing: boolean;
  encryptSensitiveData: boolean;
  autoDeleteAfterDays: number | null;
};

export const PrivacySettings = ({ onBack }: PrivacySettingsProps) => {
  const [settings, setSettings] = useState<PrivacySettings>({
    dataRetentionDays: 365,
    allowAnalytics: false,
    allowDataSharing: false,
    encryptSensitiveData: true,
    autoDeleteAfterDays: null
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchJson<PrivacySettings>('/api/privacy/settings');
      setSettings(data);
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetchJson('/api/privacy/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      announceToScreenReader('Privacy settings saved successfully');
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      announceToScreenReader('Failed to save privacy settings', 'assertive');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!confirm('This will generate a download of all your data. Continue?')) {
      return;
    }

    setExporting(true);
    try {
      const result = await fetchJson<{ downloadUrl: string; expiresAt: string }>('/api/privacy/export', {
        method: 'POST'
      });
      announceToScreenReader('Data export initiated. Check your downloads.');
      window.open(result.downloadUrl, '_blank');
    } catch (error) {
      console.error('Failed to export data:', error);
      announceToScreenReader('Failed to export data', 'assertive');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = prompt(
      'This will permanently delete your account and all data. Type "DELETE" to confirm:'
    );
    
    if (confirmed !== 'DELETE') {
      return;
    }

    setDeleting(true);
    try {
      await fetchJson('/api/privacy/delete-account', {
        method: 'DELETE'
      });
      announceToScreenReader('Account deleted. Redirecting...');
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to delete account:', error);
      announceToScreenReader('Failed to delete account', 'assertive');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-white/60">Loading privacy settings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" role="main" aria-label="Privacy Settings">
      {onBack && (
        <div className="mb-4">
          <Button variant="outline" onClick={onBack} className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Privacy & Security
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Privacy & Security Settings
          </CardTitle>
          <CardDescription>
            Control how your data is stored, shared, and protected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data Retention */}
          <div className="space-y-2">
            <Label htmlFor="retention">Data Retention Period (days)</Label>
            <Input
              id="retention"
              type="number"
              min="30"
              max="3650"
              value={settings.dataRetentionDays}
              onChange={(e) => setSettings({ ...settings, dataRetentionDays: parseInt(e.target.value) || 365 })}
              aria-describedby="retention-help"
            />
            <p id="retention-help" className="text-sm text-white/60">
              How long to keep your data (30-3650 days)
            </p>
          </div>

          {/* Auto Delete */}
          <div className="space-y-2">
            <Label htmlFor="autoDelete">Auto-Delete After (days, optional)</Label>
            <Input
              id="autoDelete"
              type="number"
              min="0"
              max="3650"
              value={settings.autoDeleteAfterDays || ''}
              onChange={(e) => setSettings({ 
                ...settings, 
                autoDeleteAfterDays: e.target.value ? parseInt(e.target.value) : null 
              })}
              placeholder="Leave empty to disable"
              aria-describedby="autoDelete-help"
            />
            <p id="autoDelete-help" className="text-sm text-white/60">
              Automatically delete entries older than this (0 to disable)
            </p>
          </div>

          {/* Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="analytics">Allow Analytics</Label>
                <p className="text-sm text-white/60">Help improve the app with anonymous usage data</p>
              </div>
              <Switch
                id="analytics"
                checked={settings.allowAnalytics}
                onCheckedChange={(checked) => setSettings({ ...settings, allowAnalytics: checked })}
                aria-label="Toggle analytics"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dataSharing">Allow Data Sharing</Label>
                <p className="text-sm text-white/60">Share anonymized data for research purposes</p>
              </div>
              <Switch
                id="dataSharing"
                checked={settings.allowDataSharing}
                onCheckedChange={(checked) => setSettings({ ...settings, allowDataSharing: checked })}
                aria-label="Toggle data sharing"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="encryption">Encrypt Sensitive Data</Label>
                <p className="text-sm text-white/60">Encrypt sensitive information at rest</p>
              </div>
              <Switch
                id="encryption"
                checked={settings.encryptSensitiveData}
                onCheckedChange={(checked) => setSettings({ ...settings, encryptSensitiveData: checked })}
                aria-label="Toggle encryption"
              />
            </div>
          </div>

          <Button onClick={saveSettings} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download all your data in JSON format (GDPR compliant)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleExport} 
            disabled={exporting}
            variant="outline"
            className="w-full"
            aria-label="Export all data"
          >
            {exporting ? 'Exporting...' : 'Export All Data'}
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="border-red-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleDeleteAccount} 
            disabled={deleting}
            variant="destructive"
            className="w-full"
            aria-label="Delete account and all data"
          >
            {deleting ? 'Deleting...' : 'Delete Account'}
          </Button>
        </CardContent>
      </Card>

      {/* Privacy Assurance */}
      <PrivacyAssurance />
    </div>
  );
};

