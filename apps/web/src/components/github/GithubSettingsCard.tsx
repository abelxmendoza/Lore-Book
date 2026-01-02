import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { useGithubSync } from '../../hooks/useGithubSync';

export const GithubSettingsCard = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const { linkRepo, syncRepo, loading } = useGithubSync();

  const handleLink = async () => {
    if (!repoUrl) return;
    await linkRepo(repoUrl);
    if (autoSync) {
      await syncRepo(repoUrl);
    }
    setRepoUrl('');
  };

  return (
    <Card className="border border-purple-900/40 bg-black/40 text-white">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base text-white">
          <span>GitHub Integration</span>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Switch checked={autoSync} onCheckedChange={setAutoSync} id="autosync" />
            <label htmlFor="autosync">Auto-sync after linking</label>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm text-white/70" htmlFor="repoUrl">
            Repository URL
          </label>
          <Input
            id="repoUrl"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="bg-purple-950/30 text-white"
          />
        </div>
        <Button disabled={loading || !repoUrl} onClick={handleLink} className="w-full">
          {loading ? 'Linking…' : 'Link repository'}
        </Button>
        <p className="text-xs text-white/60">
          We capture only meaningful milestones — features, releases, architecture shifts, and breakthroughs. Noise like tiny fixes,
          formatting changes, and README tweaks are filtered out.
        </p>
      </CardContent>
    </Card>
  );
};
