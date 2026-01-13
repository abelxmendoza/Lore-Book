/**
 * Lorebook Creator Component
 * 
 * Comprehensive UI for creating all types of lorebooks
 * Supports: Full Life, Domain-Specific, Time Range, Thematic
 * With full customization: tone, depth, audience, version
 */

import { useState } from 'react';
import { Sparkles, BookOpen, Calendar, Tag, Settings, Save, X, Loader2, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
// Using native select for now - can upgrade to proper Select component later
import { Textarea } from '../ui/textarea';
import { fetchJson } from '../../lib/api';
import type { BiographySpec, Domain, BiographyTone, BiographyDepth, BiographyAudience } from '../../../server/src/services/biographyGeneration/types';

interface KnowledgeBaseCreatorProps {
  onGenerated: (biography: any) => void;
  onClose?: () => void;
}

const DOMAINS: { value: Domain; label: string; description: string }[] = [
  { value: 'fighting', label: 'Fighting', description: 'Martial arts, combat sports, BJJ' },
  { value: 'robotics', label: 'Robotics', description: 'Engineering, coding, tech projects' },
  { value: 'relationships', label: 'Relationships', description: 'All types of relationships' },
  { value: 'creative', label: 'Creative', description: 'Art, writing, music, creative work' },
  { value: 'professional', label: 'Professional', description: 'Career, work, business' },
  { value: 'personal', label: 'Personal', description: 'Personal growth, self-development' },
  { value: 'health', label: 'Health', description: 'Fitness, wellness, medical' },
  { value: 'education', label: 'Education', description: 'Learning, courses, studies' },
  { value: 'family', label: 'Family', description: 'Family relationships and events' },
  { value: 'friendship', label: 'Friendship', description: 'Friends and social connections' },
  { value: 'romance', label: 'Romance', description: 'Dating, romantic relationships' },
];

const TONES: { value: BiographyTone; label: string; description: string }[] = [
  { value: 'neutral', label: 'Neutral', description: 'Factual, balanced narrative' },
  { value: 'dramatic', label: 'Dramatic', description: 'Emphasizes emotional impact' },
  { value: 'reflective', label: 'Reflective', description: 'Introspective, thoughtful' },
  { value: 'mythic', label: 'Mythic', description: 'Larger-than-life storytelling' },
  { value: 'professional', label: 'Professional', description: 'Business/career focused' },
];

const DEPTHS: { value: BiographyDepth; label: string; description: string }[] = [
  { value: 'summary', label: 'Summary', description: 'Brief overview' },
  { value: 'detailed', label: 'Detailed', description: 'Comprehensive narrative' },
  { value: 'epic', label: 'Epic', description: 'Extensive, in-depth storytelling' },
];

const AUDIENCES: { value: BiographyAudience; label: string; description: string }[] = [
  { value: 'self', label: 'Self', description: 'Personal, private' },
  { value: 'public', label: 'Public', description: 'Safe for sharing' },
  { value: 'professional', label: 'Professional', description: 'Career/business context' },
];

const VERSIONS: { value: 'main' | 'safe' | 'explicit' | 'private'; label: string; description: string }[] = [
  { value: 'main', label: 'Main', description: 'Default, full introspection, balanced' },
  { value: 'safe', label: 'Safe/Public', description: 'Filtered for public while living' },
  { value: 'explicit', label: 'Explicit/Death', description: 'Honest, publish after death' },
  { value: 'private', label: 'Private', description: 'Complete, never published' },
];

export const KnowledgeBaseCreator = ({ onGenerated, onClose }: KnowledgeBaseCreatorProps) => {
  const [scope, setScope] = useState<'full_life' | 'domain' | 'time_range' | 'thematic'>('full_life');
  const [domain, setDomain] = useState<Domain | undefined>(undefined);
  const [timeRangeStart, setTimeRangeStart] = useState('');
  const [timeRangeEnd, setTimeRangeEnd] = useState('');
  const [themes, setThemes] = useState('');
  const [tone, setTone] = useState<BiographyTone>('neutral');
  const [depth, setDepth] = useState<BiographyDepth>('detailed');
  const [audience, setAudience] = useState<BiographyAudience>('self');
  const [version, setVersion] = useState<'main' | 'safe' | 'explicit' | 'private'>('main');
  const [lorebookName, setLorebookName] = useState('');
  const [saveAsCore, setSaveAsCore] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);

    try {
      // Build spec based on scope
      const spec: BiographySpec & { version?: string; lorebookName?: string } = {
        scope,
        tone,
        depth,
        audience,
        version: version as any, // API expects version field
        includeIntrospection: version !== 'safe',
      };

      // Add scope-specific fields
      if (scope === 'domain') {
        if (!domain) {
          setError('Please select a domain');
          setGenerating(false);
          return;
        }
        spec.domain = domain;
      }

      if (scope === 'time_range') {
        if (!timeRangeStart || !timeRangeEnd) {
          setError('Please provide both start and end dates');
          setGenerating(false);
          return;
        }
        spec.timeRange = {
          start: new Date(timeRangeStart).toISOString(),
          end: new Date(timeRangeEnd).toISOString(),
        };
      }

      if (scope === 'thematic') {
        if (!themes.trim()) {
          setError('Please provide at least one theme');
          setGenerating(false);
          return;
        }
        spec.themes = themes.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }

      // Add lorebook name if saving as core
      if (saveAsCore && lorebookName.trim()) {
        spec.lorebookName = lorebookName.trim();
      }

      const result = await fetchJson<{ biography: any }>('/api/biography/generate', {
        method: 'POST',
        body: JSON.stringify(spec),
      });

      if (result.biography) {
        // If saving as core lorebook, save it
        if (saveAsCore && lorebookName.trim()) {
          try {
            await fetchJson(`/api/biography/${result.biography.id}/save-as-core`, {
              method: 'POST',
              body: JSON.stringify({
                lorebookName: lorebookName.trim(),
                version: 1,
              }),
            });
          } catch (saveError) {
            console.warn('Failed to save as core lorebook:', saveError);
            // Continue anyway - biography is still generated
          }
        }

        onGenerated(result.biography);
        if (onClose) {
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate knowledge base');
      console.error('Failed to generate knowledge base:', err);
    } finally {
      setGenerating(false);
    }
  };

  const getScopeDescription = () => {
    switch (scope) {
      case 'full_life':
        return 'Complete biography from beginning to present';
      case 'domain':
        return 'Focused on a specific area of your life';
      case 'time_range':
        return 'Specific period or era';
      case 'thematic':
        return 'Based on themes or topics';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <Card className="bg-black/90 border-border/60 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
              <CardTitle className="text-2xl text-white">Create Lorebook</CardTitle>
              <CardDescription className="text-white/60">
                Generate a comprehensive lorebook from your memories
              </CardDescription>
              </div>
            </div>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Scope Selection */}
          <div className="space-y-3">
            <Label className="text-white font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Scope
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['full_life', 'domain', 'time_range', 'thematic'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    scope === s
                      ? 'border-primary bg-primary/20 text-white'
                      : 'border-border/50 bg-black/40 text-white/70 hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium capitalize mb-1">
                    {s.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-white/50">
                    {s === 'full_life' && 'Complete story'}
                    {s === 'domain' && 'By area'}
                    {s === 'time_range' && 'By period'}
                    {s === 'thematic' && 'By theme'}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-white/50 flex items-start gap-2">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {getScopeDescription()}
            </p>
          </div>

          {/* Domain Selection (if scope is domain) */}
          {scope === 'domain' && (
            <div className="space-y-3">
              <Label className="text-white font-semibold">Domain</Label>
              <select
                value={domain || ''}
                onChange={(e) => setDomain(e.target.value as Domain)}
                className="w-full h-11 rounded-lg border border-border/50 bg-black/60 px-4 text-sm text-white focus:border-primary focus:outline-none"
              >
                <option value="">Select a domain</option>
                {DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label} - {d.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time Range (if scope is time_range) */}
          {scope === 'time_range' && (
            <div className="space-y-3">
              <Label className="text-white font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Time Range
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-sm mb-1 block">Start Date</Label>
                  <Input
                    type="date"
                    value={timeRangeStart}
                    onChange={(e) => setTimeRangeStart(e.target.value)}
                    className="bg-black/60 border-border/50 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-sm mb-1 block">End Date</Label>
                  <Input
                    type="date"
                    value={timeRangeEnd}
                    onChange={(e) => setTimeRangeEnd(e.target.value)}
                    className="bg-black/60 border-border/50 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Themes (if scope is thematic) */}
          {scope === 'thematic' && (
            <div className="space-y-3">
              <Label className="text-white font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Themes
              </Label>
              <Textarea
                value={themes}
                onChange={(e) => setThemes(e.target.value)}
                placeholder="Enter themes separated by commas (e.g., growth, transformation, challenges)"
                className="bg-black/60 border-border/50 text-white min-h-[80px]"
              />
              <p className="text-xs text-white/50">
                Separate multiple themes with commas
              </p>
            </div>
          )}

          {/* Style Options */}
          <div className="space-y-4 border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="h-4 w-4 text-white/70" />
              <Label className="text-white font-semibold">Style Options</Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tone */}
              <div className="space-y-2">
                <Label className="text-white/70 text-sm">Tone</Label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as BiographyTone)}
                  className="w-full h-11 rounded-lg border border-border/50 bg-black/60 px-4 text-sm text-white focus:border-primary focus:outline-none"
                >
                  {TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} - {t.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Depth */}
              <div className="space-y-2">
                <Label className="text-white/70 text-sm">Depth</Label>
                <select
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as BiographyDepth)}
                  className="w-full h-11 rounded-lg border border-border/50 bg-black/60 px-4 text-sm text-white focus:border-primary focus:outline-none"
                >
                  {DEPTHS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label} - {d.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Audience */}
              <div className="space-y-2">
                <Label className="text-white/70 text-sm">Audience</Label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as BiographyAudience)}
                  className="w-full h-11 rounded-lg border border-border/50 bg-black/60 px-4 text-sm text-white focus:border-primary focus:outline-none"
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label} - {a.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Version */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm">Version</Label>
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value as any)}
                className="w-full h-11 rounded-lg border border-border/50 bg-black/60 px-4 text-sm text-white focus:border-primary focus:outline-none"
              >
                {VERSIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label} - {v.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Save as Core Lorebook */}
          <div className="space-y-3 border-t border-border/50 pt-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="saveAsCore"
                checked={saveAsCore}
                onChange={(e) => setSaveAsCore(e.target.checked)}
                className="w-4 h-4 rounded border-border/50 bg-black/60 text-primary"
              />
              <Label htmlFor="saveAsCore" className="text-white font-semibold flex items-center gap-2">
                <Save className="h-4 w-4" />
                Save as Core Lorebook (Named & Versioned)
              </Label>
            </div>
            {saveAsCore && (
              <div className="ml-7">
                <Input
                  value={lorebookName}
                  onChange={(e) => setLorebookName(e.target.value)}
                  placeholder="Enter a name for this knowledge base (e.g., 'My Fighting Journey')"
                  className="bg-black/60 border-border/50 text-white"
                />
                <p className="text-xs text-white/50 mt-1">
                  Core Lorebooks are saved with a name and can be regenerated later
                </p>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <div className="flex gap-3 pt-4 border-t border-border/50">
            <Button
              onClick={handleGenerate}
              disabled={generating || (scope === 'domain' && !domain) || (scope === 'time_range' && (!timeRangeStart || !timeRangeEnd)) || (scope === 'thematic' && !themes.trim())}
              className="flex-1 bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Lorebook
                </>
              )}
            </Button>
            {onClose && (
              <Button
                variant="outline"
                onClick={onClose}
                disabled={generating}
                className="border-border/50 text-white/70 hover:text-white"
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
