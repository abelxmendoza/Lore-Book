/**
 * CoreLorebooks Component
 * 
 * Shows saved Core Lorebooks (canonical editions)
 * These are named, versioned, and persist over time
 * 
 * IMPORTANT: Core Lorebooks are compiled artifacts.
 * They read from memory, never modify it.
 */

import { useState, useEffect } from 'react';
import { BookOpen, Plus, Edit, History, Loader2, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import type { Biography } from '../../../server/src/services/biographyGeneration/types';

interface CoreLorebook {
  id: string;
  title: string;
  subtitle?: string;
  lorebook_name: string;
  lorebook_version: number;
  version: string;
  domain?: string;
  created_at: string;
  biography_data: Biography;
}

interface CoreLorebooksProps {
  onLoadLorebook: (biography: Biography) => void;
  onSaveAsCore?: (biographyId: string, name: string) => void;
}

export const CoreLorebooks = ({ onLoadLorebook, onSaveAsCore }: CoreLorebooksProps) => {
  const [coreLorebooks, setCoreLorebooks] = useState<CoreLorebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState<string | null>(null);
  const [lorebookName, setLorebookName] = useState('');

  useEffect(() => {
    loadCoreLorebooks();
  }, []);

  const loadCoreLorebooks = async () => {
    try {
      const result = await fetchJson<{ biographies: CoreLorebook[] }>('/api/biography/list?coreOnly=true');
      setCoreLorebooks(result.biographies || []);
    } catch (error) {
      console.error('Failed to load Core Lorebooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsCore = async (biographyId: string) => {
    if (!lorebookName.trim()) return;

    setSaving(biographyId);
    try {
      await fetchJson(`/api/biography/${biographyId}/save-as-core`, {
        method: 'POST',
        body: JSON.stringify({ lorebookName: lorebookName.trim() })
      });
      
      setShowSaveDialog(null);
      setLorebookName('');
      await loadCoreLorebooks();
    } catch (error) {
      console.error('Failed to save as Core Lorebook:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Group by lorebook name (different versions)
  const groupedLorebooks = coreLorebooks.reduce((acc, lorebook) => {
    const name = lorebook.lorebook_name || 'Unnamed';
    if (!acc[name]) {
      acc[name] = [];
    }
    acc[name].push(lorebook);
    return acc;
  }, {} as Record<string, CoreLorebook[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Core Lorebooks</h3>
          <p className="text-sm text-white/60 mt-1">
            Saved canonical editions. These are compiled artifacts from your living memory.
          </p>
        </div>
      </div>

      {Object.keys(groupedLorebooks).length === 0 ? (
        <Card className="bg-black/40 border-border/50">
          <CardContent className="p-8 text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-primary/50" />
            <h3 className="text-xl font-semibold text-white mb-2">No Core Lorebooks Yet</h3>
            <p className="text-white/60 mb-4">
              Core Lorebooks are saved, named editions of your story.
            </p>
            <p className="text-sm text-white/40">
              Generate a biography and save it as a Core Lorebook to preserve it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedLorebooks).map(([name, versions]) => (
            <Card key={name} className="bg-black/40 border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xl text-white">{name}</CardTitle>
                  </div>
                  <div className="text-xs text-white/50">
                    {versions.length} {versions.length === 1 ? 'version' : 'versions'}
                  </div>
                </div>
                <CardDescription className="text-white/60">
                  Core Lorebook — Compiled from your living memory
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {versions
                  .sort((a, b) => b.lorebook_version - a.lorebook_version)
                  .map((lorebook) => (
                    <div
                      key={lorebook.id}
                      className="p-4 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-white">
                              Version {lorebook.lorebook_version}
                            </span>
                            <span className="text-xs text-white/40 px-2 py-0.5 bg-primary/20 rounded-full">
                              {lorebook.version}
                            </span>
                            {lorebook.domain && (
                              <span className="text-xs text-white/40 px-2 py-0.5 bg-white/10 rounded-full">
                                {lorebook.domain}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-white/60">{lorebook.title}</p>
                          {lorebook.biography_data.metadata.memorySnapshotAt && (
                            <p className="text-xs text-white/40 mt-1">
                              Memory snapshot: {formatDate(lorebook.biography_data.metadata.memorySnapshotAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => onLoadLorebook(lorebook.biography_data)}
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                          leftIcon={<BookOpen className="h-3 w-3" />}
                        >
                          Read
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-white/40 hover:text-white"
                          leftIcon={<History className="h-3 w-3" />}
                          title="View version history"
                        >
                          History
                        </Button>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <Card className="bg-black/60 border-primary/30">
          <CardHeader>
            <CardTitle className="text-white">Save as Core Lorebook</CardTitle>
            <CardDescription className="text-white/60">
              Give this biography a name to save it as a Core Lorebook
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={lorebookName}
              onChange={(e) => setLorebookName(e.target.value)}
              placeholder="e.g., 'The Story of My Life', 'My Fight Career'"
              className="bg-black/40 border-white/20 text-white"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && lorebookName.trim()) {
                  handleSaveAsCore(showSaveDialog);
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => handleSaveAsCore(showSaveDialog)}
                disabled={!lorebookName.trim() || saving === showSaveDialog}
                className="flex-1 bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
              >
                {saving === showSaveDialog ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowSaveDialog(null);
                  setLorebookName('');
                }}
                variant="outline"
                className="text-white/60"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
