import { useState, useEffect, useCallback } from 'react';
import { Heart, RefreshCw, Loader2, Sparkles, Target, Shield, Zap, TrendingUp, Brain } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import type { EssenceProfile } from '../../types/essence';
import {
  EssenceSnapshot,
  EssenceCategoryCard,
  SkillsEssenceSection,
  PersonalityAndRelationships,
  SoulEvolutionTimeline,
  ChatRefinementHint,
} from './soul';

// Mock data for demonstration
const MOCK_ESSENCE_PROFILE: EssenceProfile = {
  hopes: [
    {
      text: 'To build something meaningful that outlives me',
      confidence: 0.88,
      extractedAt: '2024-01-15T10:00:00Z',
      sources: ['journal_entry_123', 'conversation_456'],
    },
    {
      text: 'To achieve financial independence through creative work',
      confidence: 0.82,
      extractedAt: '2024-01-20T14:30:00Z',
      sources: ['journal_entry_124'],
    },
    {
      text: 'To maintain deep, authentic relationships',
      confidence: 0.75,
      extractedAt: '2024-01-18T09:15:00Z',
      sources: ['conversation_457'],
    },
    {
      text: 'To continuously learn and grow as a person',
      confidence: 0.70,
      extractedAt: '2024-01-22T16:00:00Z',
      sources: ['journal_entry_125'],
    },
    {
      text: 'To make a positive impact on others',
      confidence: 0.68,
      extractedAt: '2024-01-19T11:30:00Z',
      sources: ['conversation_458'],
    },
  ],
  dreams: [
    {
      text: 'Running my own creative studio or agency',
      confidence: 0.85,
      extractedAt: '2024-01-16T10:00:00Z',
      sources: ['journal_entry_126'],
    },
    {
      text: 'Traveling the world while working remotely',
      confidence: 0.78,
      extractedAt: '2024-01-21T15:00:00Z',
      sources: ['conversation_459'],
    },
    {
      text: 'Publishing a book or creating a significant body of work',
      confidence: 0.72,
      extractedAt: '2024-01-17T13:00:00Z',
      sources: ['journal_entry_127'],
    },
    {
      text: 'Building a community around shared values',
      confidence: 0.65,
      extractedAt: '2024-01-23T10:00:00Z',
      sources: ['conversation_460'],
    },
  ],
  fears: [
    {
      text: 'Not living up to my potential',
      confidence: 0.80,
      extractedAt: '2024-01-14T09:00:00Z',
      sources: ['journal_entry_128'],
    },
    {
      text: 'Being stuck in a routine that doesn\'t fulfill me',
      confidence: 0.75,
      extractedAt: '2024-01-19T14:00:00Z',
      sources: ['conversation_461'],
    },
    {
      text: 'Losing connection with people I care about',
      confidence: 0.70,
      extractedAt: '2024-01-20T11:00:00Z',
      sources: ['journal_entry_129'],
    },
    {
      text: 'Making decisions that I\'ll regret later',
      confidence: 0.65,
      extractedAt: '2024-01-22T08:00:00Z',
      sources: ['conversation_462'],
    },
  ],
  strengths: [
    {
      text: 'Naturally empathetic and good at understanding others',
      confidence: 0.90,
      extractedAt: '2024-01-15T10:00:00Z',
      sources: ['journal_entry_130', 'conversation_463'],
    },
    {
      text: 'Persistent and disciplined when working toward goals',
      confidence: 0.85,
      extractedAt: '2024-01-18T12:00:00Z',
      sources: ['journal_entry_131'],
    },
    {
      text: 'Creative problem-solving and thinking outside the box',
      confidence: 0.82,
      extractedAt: '2024-01-21T16:00:00Z',
      sources: ['conversation_464'],
    },
    {
      text: 'Good at learning new skills quickly',
      confidence: 0.78,
      extractedAt: '2024-01-17T10:00:00Z',
      sources: ['journal_entry_132'],
    },
    {
      text: 'Self-aware and reflective about my own patterns',
      confidence: 0.75,
      extractedAt: '2024-01-23T14:00:00Z',
      sources: ['conversation_465'],
    },
  ],
  weaknesses: [
    {
      text: 'Tendency to overthink and analyze decisions',
      confidence: 0.80,
      extractedAt: '2024-01-16T11:00:00Z',
      sources: ['journal_entry_133'],
    },
    {
      text: 'Struggling with procrastination on tasks I find difficult',
      confidence: 0.75,
      extractedAt: '2024-01-19T15:00:00Z',
      sources: ['conversation_466'],
    },
    {
      text: 'Sometimes avoid difficult conversations',
      confidence: 0.70,
      extractedAt: '2024-01-20T13:00:00Z',
      sources: ['journal_entry_134'],
    },
    {
      text: 'Can be too hard on myself when things don\'t go perfectly',
      confidence: 0.68,
      extractedAt: '2024-01-22T09:00:00Z',
      sources: ['conversation_467'],
    },
  ],
  topSkills: [
    {
      skill: 'JavaScript/TypeScript',
      confidence: 0.92,
      evidence: [
        'Built multiple React applications',
        'Wrote complex API integrations',
        'Implemented state management systems',
      ],
      extractedAt: '2024-01-15T10:00:00Z',
    },
    {
      skill: 'UI/UX Design',
      confidence: 0.85,
      evidence: [
        'Designed user interfaces for web apps',
        'Created design systems and component libraries',
      ],
      extractedAt: '2024-01-18T12:00:00Z',
    },
    {
      skill: 'Problem Solving',
      confidence: 0.88,
      evidence: [
        'Debugged complex technical issues',
        'Architected scalable solutions',
      ],
      extractedAt: '2024-01-20T14:00:00Z',
    },
    {
      skill: 'Communication',
      confidence: 0.82,
      evidence: [
        'Explained technical concepts to non-technical team members',
        'Led project discussions and planning sessions',
      ],
      extractedAt: '2024-01-21T15:00:00Z',
    },
    {
      skill: 'Project Management',
      confidence: 0.75,
      evidence: [
        'Managed multiple projects simultaneously',
        'Coordinated with cross-functional teams',
      ],
      extractedAt: '2024-01-22T16:00:00Z',
    },
    {
      skill: 'Writing',
      confidence: 0.78,
      evidence: [
        'Wrote technical documentation',
        'Created blog posts and articles',
      ],
      extractedAt: '2024-01-23T10:00:00Z',
    },
  ],
  coreValues: [
    {
      text: 'Authenticity and being true to myself',
      confidence: 0.90,
      extractedAt: '2024-01-15T10:00:00Z',
      sources: ['journal_entry_135', 'conversation_468'],
    },
    {
      text: 'Continuous growth and learning',
      confidence: 0.85,
      extractedAt: '2024-01-18T12:00:00Z',
      sources: ['journal_entry_136'],
    },
    {
      text: 'Meaningful relationships and connection',
      confidence: 0.82,
      extractedAt: '2024-01-20T14:00:00Z',
      sources: ['conversation_469'],
    },
    {
      text: 'Creativity and self-expression',
      confidence: 0.78,
      extractedAt: '2024-01-21T15:00:00Z',
      sources: ['journal_entry_137'],
    },
    {
      text: 'Balance between work and personal life',
      confidence: 0.72,
      extractedAt: '2024-01-22T16:00:00Z',
      sources: ['conversation_470'],
    },
  ],
  personalityTraits: [
    {
      text: 'Introverted but enjoys deep conversations',
      confidence: 0.85,
      extractedAt: '2024-01-15T10:00:00Z',
      sources: ['journal_entry_138'],
    },
    {
      text: 'Thoughtful and reflective',
      confidence: 0.82,
      extractedAt: '2024-01-18T12:00:00Z',
      sources: ['conversation_471'],
    },
    {
      text: 'Curious and open-minded',
      confidence: 0.80,
      extractedAt: '2024-01-20T14:00:00Z',
      sources: ['journal_entry_139'],
    },
    {
      text: 'Perfectionist tendencies',
      confidence: 0.75,
      extractedAt: '2024-01-21T15:00:00Z',
      sources: ['conversation_472'],
    },
    {
      text: 'Empathetic and considerate',
      confidence: 0.88,
      extractedAt: '2024-01-22T16:00:00Z',
      sources: ['journal_entry_140'],
    },
    {
      text: 'Independent and self-directed',
      confidence: 0.78,
      extractedAt: '2024-01-23T10:00:00Z',
      sources: ['conversation_473'],
    },
  ],
  relationshipPatterns: [
    {
      text: 'Tends to avoid conflict but values honest communication',
      confidence: 0.80,
      extractedAt: '2024-01-16T11:00:00Z',
      sources: ['journal_entry_141'],
    },
    {
      text: 'Prefers deep, meaningful connections over many superficial ones',
      confidence: 0.85,
      extractedAt: '2024-01-19T15:00:00Z',
      sources: ['conversation_474'],
    },
    {
      text: 'Often takes on the role of listener and supporter',
      confidence: 0.75,
      extractedAt: '2024-01-20T13:00:00Z',
      sources: ['journal_entry_142'],
    },
    {
      text: 'Values quality time and shared experiences',
      confidence: 0.78,
      extractedAt: '2024-01-22T09:00:00Z',
      sources: ['conversation_475'],
    },
  ],
  evolution: [
    {
      date: '2024-01-23T10:00:00Z',
      changes: 'New core value identified: balance between work and personal life',
      trigger: 'journal entry',
    },
    {
      date: '2024-01-22T16:00:00Z',
      changes: 'Recognized 2 new skills: Project Management and Writing',
      trigger: 'conversation',
    },
    {
      date: '2024-01-21T15:00:00Z',
      changes: 'Discovered 1 new hope: building a community around shared values',
      trigger: 'journal entry',
    },
    {
      date: '2024-01-20T14:00:00Z',
      changes: 'Strength confidence increased: empathetic and understanding others',
      trigger: 'conversation',
    },
    {
      date: '2024-01-18T12:00:00Z',
      changes: 'New personality trait identified: thoughtful and reflective',
      trigger: 'journal entry',
    },
  ],
};

/**
 * SoulProfilePanel - Read-Only Analytics Panel
 * 
 * Mental Model:
 * - Panels observe
 * - Chat negotiates meaning
 * - Profile evolves
 * 
 * All refinement happens through chat, not UI controls.
 */
export const SoulProfilePanel = () => {
  const isMockDataEnabled = useShouldUseMockData();
  const [profile, setProfile] = useState<EssenceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ profile: EssenceProfile }>('/api/essence/profile');
      setProfile(response.profile);
    } catch (error) {
      console.error('Failed to load essence profile:', error);
      // Use mock data only if toggle is enabled
      if (isMockDataEnabled) {
        setProfile(MOCK_ESSENCE_PROFILE);
      } else {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await fetchJson('/api/essence/extract', { method: 'POST' });
      await loadProfile();
    } catch (error) {
      console.error('Failed to extract essence:', error);
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
        <CardContent className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/60">Loading your essence profile...</p>
        </CardContent>
      </Card>
    );
  }

  // Use mock data only if toggle is enabled and no real profile
  const displayProfile = profile || (isMockDataEnabled ? MOCK_ESSENCE_PROFILE : null);
  const isMockData = !profile && isMockDataEnabled;

  if (!profile && !loading) {
    return (
      <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-white">Soul Profile</CardTitle>
          <CardDescription className="text-white/60">
            Your evolving psychological core
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Heart className="h-16 w-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 mb-4">No profile data yet</p>
          <Button
            onClick={handleExtract}
            disabled={extracting}
            className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
          >
            {extracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Extracting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Capturing Your Essence
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. PanelHeader */}
      <Card className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/20 rounded-lg">
                <Heart className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold text-white mb-1">Soul Profile</CardTitle>
                <CardDescription className="text-sm text-white/60">
                  Your evolving psychological core
                </CardDescription>
                <p className="text-xs text-white/40 mt-1.5">
                  What consistently defines you across time
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExtract}
              disabled={extracting}
              className="text-white/70 hover:text-white"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Extracting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isMockData && (
        <div className="text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
          📊 Showing mock data for demonstration. Real data will appear as you journal and chat.
        </div>
      )}

      {/* 2. EssenceSnapshot */}
      <EssenceSnapshot profile={displayProfile} />

      {/* 3. CoreEssenceGrid */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white mb-4">Core Essence</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EssenceCategoryCard
              title="Hopes"
              icon={Heart}
              items={displayProfile.hopes || []}
              color="text-pink-400"
            />
            <EssenceCategoryCard
              title="Dreams"
              icon={Target}
              items={displayProfile.dreams || []}
              color="text-blue-400"
            />
            <EssenceCategoryCard
              title="Fears"
              icon={Shield}
              items={displayProfile.fears || []}
              color="text-red-400"
            />
            <EssenceCategoryCard
              title="Strengths"
              icon={Zap}
              items={displayProfile.strengths || []}
              color="text-green-400"
            />
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white mb-4">Growth & Values</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EssenceCategoryCard
              title="Areas for Growth"
              icon={TrendingUp}
              items={displayProfile.weaknesses || []}
              color="text-yellow-400"
            />
            <EssenceCategoryCard
              title="Core Values"
              icon={Brain}
              items={displayProfile.coreValues || []}
              color="text-purple-400"
            />
          </div>
        </div>
      </div>

      {/* 4. SkillsEssenceSection */}
      <SkillsEssenceSection skills={displayProfile.topSkills || []} />

      {/* 5. PersonalityAndRelationships */}
      <PersonalityAndRelationships
        personalityTraits={displayProfile.personalityTraits || []}
        relationshipPatterns={displayProfile.relationshipPatterns || []}
      />

      {/* 6. EvolutionTimeline */}
      <SoulEvolutionTimeline evolution={displayProfile.evolution || []} />

      {/* 7. ChatRefinementHint */}
      <ChatRefinementHint />
    </div>
  );
};
