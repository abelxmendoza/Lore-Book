/**
 * SavedBiographies Component
 * 
 * Shows all generated biographies (ephemeral queries)
 * 
 * NOTE: These are compiled artifacts, not sources of truth.
 * Chat + Memory Graph = source of truth
 * Biographies = compiled views at moments in time
 */

import { useState, useEffect } from 'react';
import { BookOpen, Trash2, RefreshCw, Eye, Download, Loader2, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import type { Biography } from '../../../server/src/services/biographyGeneration/types';

interface SavedBiography {
  id: string;
  title: string;
  subtitle?: string;
  domain?: string;
  is_core_lorebook?: boolean;
  lorebook_name?: string;
  created_at: string;
  biography_data: Biography;
}

interface SavedBiographiesProps {
  onLoadBiography: (biography: Biography) => void;
  onSaveAsCore?: (biographyId: string, name: string) => void;
}

export const SavedBiographies = ({ onLoadBiography, onGenerateVersion }: SavedBiographiesProps) => {
  const [biographies, setBiographies] = useState<SavedBiography[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadBiographies();
  }, []);

  const loadBiographies = async () => {
    try {
      // Load only ephemeral biographies (not Core Lorebooks)
      const result = await fetchJson<{ biographies: SavedBiography[] }>('/api/biography/list');
      // Filter out Core Lorebooks (they're shown in separate component)
      const ephemeral = (result.biographies || []).filter(b => !b.is_core_lorebook);
      setBiographies(ephemeral);
    } catch (error) {
      console.error('Failed to load biographies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this biography?')) return;
    
    setDeleting(id);
    try {
      await fetchJson(`/api/biography/${id}`, { method: 'DELETE' });
      setBiographies(prev => prev.filter(b => b.id !== id));
    } catch (error) {
      console.error('Failed to delete biography:', error);
      alert('Failed to delete biography. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleLoad = (biography: Biography) => {
    onLoadBiography(biography);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (biographies.length === 0) {
    return (
      <Card className="bg-black/40 border-border/50">
        <CardContent className="p-8 text-center">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-xl font-semibold text-white mb-2">No Saved Biographies</h3>
          <p className="text-white/60">
            Generate a biography to see it here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Generated Views</h3>
          <p className="text-xs text-white/50 mt-1">
            Ephemeral queries — compiled artifacts from your living memory
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadBiographies}
          className="text-white/60 hover:text-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {biographies.map((bio) => (
          <Card
            key={bio.id}
            className="bg-black/40 border-border/50 hover:border-primary/30 transition-colors"
          >
            <CardHeader>
              <CardTitle className="text-lg text-white line-clamp-2">{bio.title}</CardTitle>
              {bio.subtitle && (
                <CardDescription className="text-white/60">{bio.subtitle}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-white/50">
                {bio.domain && (
                  <span className="px-2 py-1 bg-primary/20 text-primary rounded-full">
                    {bio.domain}
                  </span>
                )}
                <span>{formatDate(bio.created_at)}</span>
              </div>
              
              <div className="text-xs text-white/40">
                {bio.biography_data.chapters.length} chapters
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleLoad(bio.biography_data)}
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                  leftIcon={<Eye className="h-3 w-3" />}
                >
                  View
                </Button>
                {onSaveAsCore && (
                  <Button
                    onClick={() => {
                      const name = prompt('Enter a name for this Core Lorebook:');
                      if (name) onSaveAsCore(bio.id, name);
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                    leftIcon={<Star className="h-3 w-3" />}
                    title="Save as Core Lorebook"
                  >
                    Save
                  </Button>
                )}
                <Button
                  onClick={() => handleDelete(bio.id)}
                  variant="ghost"
                  size="sm"
                  disabled={deleting === bio.id}
                  className="text-white/40 hover:text-red-400"
                >
                  {deleting === bio.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
