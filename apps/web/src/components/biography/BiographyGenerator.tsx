/**
 * BiographyGenerator Component
 * UI for generating biographies from NarrativeAtoms
 */

import { useState } from 'react';
import { Sparkles, Loader2, BookOpen, Search, Calendar, Users, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { fetchJson } from '../../lib/api';
import type { Biography, BiographySpec } from '../../../server/src/services/biographyGeneration/types';

interface BiographyGeneratorProps {
  onBiographyGenerated?: (biography: Biography) => void;
}

export const BiographyGenerator = ({ onBiographyGenerated }: BiographyGeneratorProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [spec, setSpec] = useState<Partial<BiographySpec>>({
    scope: 'full_life',
    tone: 'neutral',
    depth: 'detailed',
    audience: 'self',
    includeIntrospection: true
  });

  const handleGenerate = async () => {
    if (!searchQuery.trim() && spec.scope === 'thematic') {
      return; // Need search query for thematic
    }

    setGenerating(true);
    try {
      // Parse search query to determine spec
      const parsedSpec = parseSearchQuery(searchQuery, spec);
      
      const result = await fetchJson<{ biography: Biography }>('/api/biography/generate', {
        method: 'POST',
        body: JSON.stringify(parsedSpec)
      });

      if (result.biography && onBiographyGenerated) {
        onBiographyGenerated(result.biography);
      }
    } catch (error) {
      console.error('Failed to generate biography:', error);
    } finally {
      setGenerating(false);
    }
  };

  const parseSearchQuery = (query: string, baseSpec: Partial<BiographySpec>): BiographySpec => {
    const lowerQuery = query.toLowerCase();
    
    // Detect domain
    let domain: BiographySpec['domain'] | undefined;
    if (lowerQuery.includes('fight') || lowerQuery.includes('bjj') || lowerQuery.includes('martial')) {
      domain = 'fighting';
    } else if (lowerQuery.includes('robot') || lowerQuery.includes('code') || lowerQuery.includes('programming')) {
      domain = 'robotics';
    } else if (lowerQuery.includes('relationship') || lowerQuery.includes('love') || lowerQuery.includes('friend')) {
      domain = 'relationships';
    } else if (lowerQuery.includes('creative') || lowerQuery.includes('art')) {
      domain = 'creative';
    } else if (lowerQuery.includes('work') || lowerQuery.includes('career') || lowerQuery.includes('professional')) {
      domain = 'professional';
    }

    // Detect tone
    let tone: BiographySpec['tone'] = baseSpec.tone || 'neutral';
    if (lowerQuery.includes('dramatic') || lowerQuery.includes('epic')) {
      tone = 'dramatic';
    } else if (lowerQuery.includes('reflective') || lowerQuery.includes('thoughtful')) {
      tone = 'reflective';
    } else if (lowerQuery.includes('mythic') || lowerQuery.includes('legend')) {
      tone = 'mythic';
    } else if (lowerQuery.includes('professional') || lowerQuery.includes('resume')) {
      tone = 'professional';
    }

    // Detect scope
    let scope: BiographySpec['scope'] = baseSpec.scope || 'full_life';
    if (domain) {
      scope = 'domain';
    } else if (lowerQuery.includes('year') || lowerQuery.includes('2024') || lowerQuery.includes('2023')) {
      scope = 'time_range';
    } else if (lowerQuery.includes('theme') || lowerQuery.includes('about')) {
      scope = 'thematic';
    }

    // Extract themes from query
    const themes = query.split(/\s+/).filter(word => 
      word.length > 4 && 
      !['about', 'my', 'the', 'and', 'for', 'with'].includes(word.toLowerCase())
    );

    return {
      scope,
      domain,
      tone,
      depth: baseSpec.depth || 'detailed',
      audience: baseSpec.audience || 'self',
      includeIntrospection: baseSpec.includeIntrospection !== false,
      themes: themes.length > 0 ? themes : undefined
    };
  };

  return (
    <Card className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Sparkles className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-xl text-white">Generate Biography</CardTitle>
            <CardDescription className="text-white/70">
              Create a biography from your narrative data
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-white/40" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g., 'my fighting career', 'robotics journey 2024', 'relationships story'"
            className="pl-10 bg-black/40 border-white/20 text-white placeholder:text-white/40"
          />
        </div>

        {/* Quick Options */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('my full life story');
              setSpec({ ...spec, scope: 'full_life' });
            }}
            className="bg-black/40 border-white/20 text-white hover:bg-white/10"
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Full Life
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('my fighting career');
              setSpec({ ...spec, scope: 'domain', domain: 'fighting' });
            }}
            className="bg-black/40 border-white/20 text-white hover:bg-white/10"
          >
            <Zap className="h-4 w-4 mr-2" />
            Fighting
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('my robotics journey');
              setSpec({ ...spec, scope: 'domain', domain: 'robotics' });
            }}
            className="bg-black/40 border-white/20 text-white hover:bg-white/10"
          >
            <Zap className="h-4 w-4 mr-2" />
            Robotics
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('my relationships');
              setSpec({ ...spec, scope: 'domain', domain: 'relationships' });
            }}
            className="bg-black/40 border-white/20 text-white hover:bg-white/10"
          >
            <Users className="h-4 w-4 mr-2" />
            Relationships
          </Button>
        </div>

        {/* Advanced Options */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Tone</label>
            <select
              value={spec.tone || 'neutral'}
              onChange={(e) => setSpec({ ...spec, tone: e.target.value as BiographySpec['tone'] })}
              className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm text-white"
            >
              <option value="neutral">Neutral</option>
              <option value="dramatic">Dramatic</option>
              <option value="reflective">Reflective</option>
              <option value="mythic">Mythic</option>
              <option value="professional">Professional</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Depth</label>
            <select
              value={spec.depth || 'detailed'}
              onChange={(e) => setSpec({ ...spec, depth: e.target.value as BiographySpec['depth'] })}
              className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm text-white"
            >
              <option value="summary">Summary</option>
              <option value="detailed">Detailed</option>
              <option value="epic">Epic</option>
            </select>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || (!searchQuery.trim() && spec.scope === 'thematic')}
          className="w-full bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Biography
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
