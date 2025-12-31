/**
 * BiographyRecommendations Component
 * 
 * Shows top 4 recommended biographies based on user interests
 * Always includes Full Life Story with multiple versions
 */

import { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Lock, Globe, Eye, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import type { BiographySpec } from '../../../server/src/services/biographyGeneration/types';

interface BiographyRecommendation {
  id: string;
  title: string;
  description: string;
  spec: BiographySpec;
  reason: string;
  priority: number;
  estimatedChapters: number;
}

interface BiographyVersion {
  id: string;
  name: 'main' | 'safe' | 'explicit' | 'private';
  displayName: string;
  description: string;
  audience: BiographySpec['audience'];
  includeIntrospection: boolean;
  filterSensitive: boolean;
}

interface BiographyRecommendationsProps {
  onGenerate: (spec: BiographySpec, version?: string) => void;
}

export const BiographyRecommendations = ({ onGenerate }: BiographyRecommendationsProps) => {
  const [recommendations, setRecommendations] = useState<BiographyRecommendation[]>([]);
  const [versions, setVersions] = useState<BiographyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      const result = await fetchJson<{
        recommendations: BiographyRecommendation[];
        versions: BiographyVersion[];
      }>('/api/biography/recommendations');
      
      setRecommendations(result.recommendations);
      setVersions(result.versions);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = (recommendation: BiographyRecommendation, version?: BiographyVersion) => {
    const spec: BiographySpec = {
      ...recommendation.spec,
      version: (version?.name || recommendation.spec.version || 'main') as BiographySpec['version'], // Build flag
      audience: version?.audience || recommendation.spec.audience,
      includeIntrospection: version?.includeIntrospection ?? recommendation.spec.includeIntrospection
    };

    onGenerate(spec, version?.name);
  };

  const getVersionIcon = (version: BiographyVersion) => {
    switch (version.name) {
      case 'safe':
        return <Globe className="h-4 w-4" />;
      case 'explicit':
        return <Eye className="h-4 w-4" />;
      case 'private':
        return <Lock className="h-4 w-4" />;
      default:
        return <BookOpen className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const fullLifeStory = recommendations.find(r => r.id === 'full-life-story');
  const otherRecommendations = recommendations.filter(r => r.id !== 'full-life-story');

  return (
    <div className="space-y-6">
      {/* Full Life Story with Versions */}
      {fullLifeStory && (
        <Card className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-purple-500/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl text-white">{fullLifeStory.title}</CardTitle>
                <CardDescription className="text-white/70">
                  {fullLifeStory.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/60">{fullLifeStory.reason}</p>
            
            {/* Version Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white/80">Choose Version:</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedVersion(expandedVersion === 'full-life' ? null : 'full-life')}
                  className="text-white/60 hover:text-white"
                >
                  {expandedVersion === 'full-life' ? 'Hide' : 'Show'} Versions
                </Button>
              </div>

              {expandedVersion === 'full-life' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => handleGenerate(fullLifeStory, version)}
                      className="p-4 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 transition-all text-left group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/20 rounded-lg group-hover:bg-primary/30 transition-colors">
                          {getVersionIcon(version)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white mb-1">
                            {version.displayName}
                          </div>
                          <div className="text-xs text-white/60">
                            {version.description}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-white/60 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Generate Main Version */}
              <Button
                onClick={() => handleGenerate(fullLifeStory)}
                className="w-full bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                Generate Main Version
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other Recommendations */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Recommended for You</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {otherRecommendations.map((recommendation) => (
            <Card
              key={recommendation.id}
              className="bg-black/40 border-border/50 hover:border-primary/30 transition-colors"
            >
              <CardHeader>
                <CardTitle className="text-lg text-white">{recommendation.title}</CardTitle>
                <CardDescription className="text-white/60">
                  {recommendation.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-white/50">{recommendation.reason}</p>
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>~{recommendation.estimatedChapters} chapters</span>
                  <span>Priority #{recommendation.priority}</span>
                </div>
                <Button
                  onClick={() => handleGenerate(recommendation)}
                  variant="outline"
                  size="sm"
                  className="w-full bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                  leftIcon={<Sparkles className="h-3 w-3" />}
                >
                  Generate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
