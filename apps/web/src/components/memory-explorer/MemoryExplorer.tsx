import { useState, useEffect, useMemo } from 'react';
import { Search, Sparkles, RefreshCw, ChevronLeft, ChevronRight, BookOpen, LayoutGrid, Calendar, Tag, Heart, FileText, Clock, CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import { Badge } from '../ui/badge';
import { MemoryCardComponent } from './MemoryCard';
import { MemoryDetailModal } from './MemoryDetailModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard, type MemorySearchResult } from '../../types/memory';
import type { HQIResult } from '../hqi/HQIResultCard';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { mockDataService } from '../../services/mockDataService';
import { useMockData } from '../../contexts/MockDataContext';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { useMemoryReviewQueue, type MemoryProposal } from '../../hooks/useMemoryReviewQueue';
import { MOCK_MEMORY_PROPOSALS } from '../../mocks/memoryProposals';

const DEBOUNCE_DELAY = 300;
const ITEMS_PER_PAGE = 18; // 3 columns × 6 rows on mobile, more on larger screens

// ProposalCard component for Memory Review Queue
const RiskBadge = ({ riskLevel }: { riskLevel: string }) => {
  const colors = {
    LOW: 'bg-green-500/20 text-green-400 border-green-500/50',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    HIGH: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[riskLevel as keyof typeof colors] || colors.MEDIUM}`}>
      {riskLevel} Risk
    </span>
  );
};

const ConfidenceBar = ({ confidence }: { confidence: number }) => {
  const percentage = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-12 text-right">{percentage}%</span>
    </div>
  );
};

interface ProposalCardProps {
  proposal: MemoryProposal;
  onAction: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}

const ProposalCard = ({ proposal, onAction, onApprove, onReject }: ProposalCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      await onApprove(proposal.id);
      onAction();
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Why are you rejecting this? (This helps the system learn your preferences)');
    setActionLoading('reject');
    try {
      await onReject(proposal.id, reason || undefined);
      onAction();
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <RiskBadge riskLevel={proposal.risk_level} />
            <ConfidenceBar confidence={proposal.confidence} />
          </div>
          <p className="text-white text-sm leading-relaxed">
            {proposal.claim_text}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-white/70" />
          ) : (
            <ChevronDown className="h-5 w-5 text-white/70" />
          )}
        </button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="space-y-3 pt-3 border-t border-white/10">
          {proposal.reasoning && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-4 w-4 text-white/60" />
                <span className="text-xs font-medium text-white/60">Why this was suggested</span>
              </div>
              <p className="text-sm text-white/80 ml-6">{proposal.reasoning}</p>
            </div>
          )}

          {proposal.source_excerpt && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-4 w-4 text-white/60" />
                <span className="text-xs font-medium text-white/60">Source excerpt</span>
              </div>
              <p className="text-sm text-white/80 ml-6 italic">"{proposal.source_excerpt}"</p>
            </div>
          )}

          {proposal.affected_claim_ids && proposal.affected_claim_ids.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span className="text-xs font-medium text-white/60">
                  Affects {proposal.affected_claim_ids.length} existing {proposal.affected_claim_ids.length === 1 ? 'claim' : 'claims'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        <button
          onClick={handleApprove}
          disabled={actionLoading !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <CheckCircle2 className="h-4 w-4" />
          {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
        </button>
        <button
          onClick={handleReject}
          disabled={actionLoading !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <XCircle className="h-4 w-4" />
          {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
      
      {/* Learning Indicator */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-xs text-white/40 italic">
          💡 Your decisions help the system learn your preferences and improve future suggestions
        </p>
      </div>
    </div>
  );
};

// Comprehensive mock memory data showcasing all app capabilities
// Export for use in mock data service
export const dummyMemoryCards: MemoryCard[] = [
  {
    id: 'dummy-1',
    title: 'Met Alex at the Coffee Shop',
    content: 'I was working on a writing project at the coffee shop downtown when this guy sat down at the table next to me. We started talking about creative work and life transitions. His name is Alex, and we ended up talking for hours. He\'s supportive of my shift from tech to creative work, which is refreshing. There\'s something about him that feels different - genuine, kind, and he makes me laugh. We exchanged numbers. I think Sarah would like him.',
    date: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['coffee-shop', 'meeting', 'relationship', 'creative-renaissance'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    chapterTitle: 'Relationship Journey',
    characters: ['Alex', 'Sarah'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-2',
    title: 'First Music Production Session with Alex Rivera',
    content: 'Had my first real music production session with Alex Rivera in my home studio today. Marcus introduced us a few years ago, but we\'ve been collaborating more since I started my creative transition. Alex Rivera is incredibly talented and patient - they taught me so much about mixing and sound design. We worked on a track for 6 hours and it flew by. This is what I want to be doing with my life.',
    date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music-production', 'collaboration', 'creative-work', 'home-studio'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex Rivera', 'Marcus Johnson'],
    arcTitle: 'Music Production Saga'
  },
  {
    id: 'dummy-3',
    title: 'Writing Session with Sarah at Coffee Shop',
    content: 'Met Sarah at the coffee shop downtown for our weekly writing session. She\'s working on a tech blog and I\'m working on a short story. It\'s become our thing - we both work on our projects side by side, occasionally sharing ideas. She asked about Alex (my boyfriend) and I told her how well things are going. She\'s been so supportive of my creative transition, even though she\'s staying in tech. That\'s what I love about our friendship - we support each other\'s different paths.',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['coffee-shop', 'writing', 'friendship', 'creative-work'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Sarah Chen', 'Alex'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-4',
    title: 'Walk in Golden Gate Park with Alex',
    content: 'Alex and I went for a long walk in Golden Gate Park today. We talked about our creative projects - he\'s been helping me set up my home studio and I\'ve been helping him with some writing. It\'s been 6 months and I still get butterflies when I see him. He makes me feel safe and understood. We sat on a bench and watched the sunset. I told him about my conversation with Marcus about pursuing music production full-time, and he was so supportive. This is what a healthy relationship feels like.',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['golden-gate-park', 'relationship', 'dates', 'creative-renaissance'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    chapterTitle: 'Relationship Journey',
    characters: ['Alex', 'Marcus Johnson'],
    arcTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-5',
    title: 'Conversation with Marcus About Career Transition',
    content: 'Had a long conversation with Marcus today about my career transition. He\'s been my mentor for years, and he was the one who first encouraged me to pursue creative work when I was stuck in my corporate job. He introduced me to Alex Rivera for music collaboration and has been a constant source of support. Today we talked about taking music production more seriously - maybe even making it my main focus. Marcus thinks I\'m ready. Sarah thinks so too. I think I\'m ready too.',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['mentorship', 'career-transition', 'creative-renaissance', 'reflection'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Marcus Johnson', 'Sarah Chen', 'Alex Rivera'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-6',
    title: 'Met Jordan at Art Gallery Opening',
    content: 'Went to an art gallery opening in the Mission District tonight. Sarah came with me for moral support. There was this person there - Jordan - who caught my attention immediately. They\'re incredibly attractive and we had a fascinating conversation about art and music. They\'re also into music production, which is exciting. I felt a spark, but I\'m with Alex, so I\'m trying to be respectful. Sarah thinks I have a pattern of getting infatuated with creative people. She might be right.',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['art-gallery', 'meeting', 'crush', 'creative-scene'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Jordan', 'Sarah Chen'],
    arcTitle: 'Relationship Journey'
  },
  {
    id: 'dummy-7',
    title: 'Late Night Music Production Session',
    content: 'Spent the night in my home studio working on a new track. Alex Rivera came over and we worked until 3 AM. The satisfaction of finally getting the mix right was worth the exhaustion. Sometimes the best creative work happens when the world is quiet. Alex (my boyfriend) texted to check in - he\'s so understanding about my creative process. I feel lucky to have people in my life who support my passion.',
    date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music-production', 'home-studio', 'late-night', 'collaboration'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex Rivera', 'Alex'],
    sagaTitle: 'Music Production Saga'
  },
  {
    id: 'dummy-8',
    title: 'Moment of Clarity About Creative Path',
    content: 'Had a moment of clarity today about fully committing to my creative path. I was at the coffee shop working on a story, and it hit me - this is what I want to do. Not as a side project, but as my main focus. I called Marcus and told him, and he was so supportive. Sarah already knows - she\'s seen this coming. Alex is on board too. Sometimes you need to step back and see the bigger picture. The path forward is clearer now.',
    date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['clarity', 'career-transition', 'creative-renaissance', 'reflection'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Marcus Johnson', 'Sarah Chen', 'Alex'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-9',
    title: 'Writing Workshop with Sophia',
    content: 'Attended a writing workshop with Sophia Anderson today at the library. Her feedback on my work has been incredibly insightful. She introduced me to Emma, and now we have a little writing group. Sophia knows about my music production work and often encourages me to blend different creative mediums. I\'m learning so much from her. Writing feels like another piece of my creative puzzle falling into place.',
    date: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['writing', 'workshop', 'learning', 'mentorship'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    chapterTitle: 'Creative Renaissance',
    characters: ['Sophia Anderson', 'Emma Thompson'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-10',
    title: 'First EP Concept - Album Arc Begins',
    content: 'Came up with the concept for my first EP today. I was in my home studio late at night, and everything clicked. It\'s going to be about transformation - leaving tech behind, finding my creative voice, the relationships that shaped me. Alex Rivera is going to help me produce it. I called Alex (my boyfriend) to tell him and he was so excited for me. This feels like the beginning of something real.',
    date: new Date(Date.now() - 335 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music-production', 'ep', 'album', 'creative-project', 'home-studio'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex Rivera', 'Alex'],
    arcTitle: 'First Album Arc'
  },
  {
    id: 'dummy-11',
    title: 'Weekend with Jordan (Sibling) in Golden Gate Park',
    content: 'Went for a run with Jordan in Golden Gate Park this weekend. They\'ve been so supportive of my creative transition. We talked about my relationship with Alex and how different it feels from my past relationships. Jordan was there for me when things ended with Taylor, and they\'ve seen me through the whole creative renaissance journey. Having family support means everything.',
    date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['golden-gate-park', 'family', 'exercise', 'reflection'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Jordan Kim', 'Alex', 'Taylor'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-12',
    title: 'Breakthrough in Music Production',
    content: 'Had a breakthrough in music production today. I finally understood how to layer synths properly after weeks of struggling. Alex Rivera has been so patient teaching me. We worked on a track in my home studio and it\'s starting to sound professional. Marcus would be proud - he\'s the one who encouraged me to pursue this. Sometimes persistence pays off, especially when you have the right people supporting you.',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music-production', 'breakthrough', 'learning', 'home-studio'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex Rivera', 'Marcus Johnson'],
    arcTitle: 'Music Production Saga'
  },
  {
    id: 'dummy-13',
    title: 'Photo Walk with David in Golden Gate Park',
    content: 'Went on a photo walk with David Martinez in Golden Gate Park today. He has an incredible eye for composition and always pushes me to see things from new angles. We\'ve been friends since photography class, and he\'s been supportive of my creative transition. We talked about my music production work and he suggested incorporating visual elements. David knows Sarah and we sometimes all hang out together. Good friends make the creative journey less lonely.',
    date: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['photography', 'golden-gate-park', 'friendship', 'creative-work'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['David Martinez', 'Sarah Chen'],
    arcTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-14',
    title: 'Started Music Production Course',
    content: 'Started a music production course today. Marcus recommended it - he\'s been so supportive of my creative transition. I\'m learning the fundamentals of sound design and mixing. Alex Rivera is helping me practice in my home studio. This feels like the right path. I\'m excited to see where this journey takes me.',
    date: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music-production', 'learning', 'education', 'creative-renaissance'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Marcus Johnson', 'Alex Rivera'],
    sagaTitle: 'Music Production Saga'
  },
  {
    id: 'dummy-15',
    title: 'Evening Walk with Alex in Golden Gate Park',
    content: 'Alex and I took a long walk in Golden Gate Park this evening. We talked about our creative projects and our relationship. It\'s been 6 months and things are going so well. He\'s supportive of my music production and writing, and I love hearing about his work. The quiet of the evening helps me process everything that\'s happening. Nature has a way of putting things in perspective. I feel grateful for this relationship and this creative journey.',
    date: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['golden-gate-park', 'relationship', 'dates', 'reflection'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex'],
    sagaTitle: 'Relationship Journey'
  },
  {
    id: 'dummy-16',
    title: 'First Track Completed - Music Milestone',
    content: 'Finished my first complete track today! Alex Rivera and I have been working on it in my home studio for weeks. It\'s not perfect, but it\'s mine. I called Marcus to tell him - he was the one who encouraged me to pursue music production. Sarah came over to listen and she was so supportive. Alex (my boyfriend) is proud of me. This feels like a real milestone in my creative journey.',
    date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music-production', 'milestone', 'achievement', 'home-studio'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex Rivera', 'Marcus Johnson', 'Sarah Chen', 'Alex'],
    arcTitle: 'Music Production Saga'
  },
  {
    id: 'dummy-17',
    title: 'Deep Conversation with Alex About Future',
    content: 'Had a deep conversation with Alex today at the coffee shop about life, purpose, and where we\'re both heading. We talked about my creative transition and his work. These conversations always leave me with new perspectives. He makes me feel understood in a way I haven\'t felt before. We\'ve been together 6 months and I can see a future with him. That\'s something I couldn\'t say about my past relationships.',
    date: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['coffee-shop', 'relationship', 'conversation', 'future'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex'],
    sagaTitle: 'Relationship Journey'
  },
  {
    id: 'dummy-18',
    title: 'Technical Challenge Overcome',
    content: 'Overcame a significant technical challenge today. The solution was elegant and I learned a lot in the process. These moments remind me why I love what I do.',
    date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['technical', 'challenge', 'solution', 'learning'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    arcTitle: 'Development'
  },
  {
    id: 'dummy-19',
    title: 'Morning Routine Reflection',
    content: 'Reflected on my morning routine today. Small habits compound over time, and I can see how my daily practices have shaped who I am becoming.',
    date: new Date(Date.now() - 47 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['routine', 'habits', 'reflection', 'growth'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-20',
    title: 'Innovation Workshop',
    content: 'Attended an innovation workshop today. The ideas and energy were inspiring. Came away with several concepts I want to explore further.',
    date: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['workshop', 'innovation', 'ideas', 'inspiration'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Dr. Martinez', 'Sarah'],
    arcTitle: 'Learning & Growth'
  },
  {
    id: 'dummy-21',
    title: 'Martial Arts Tournament Victory',
    content: 'Won my first tournament match today! The training with Master Chen paid off. The discipline and focus I\'ve developed translated perfectly into the competition.',
    date: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['martial-arts', 'tournament', 'victory', 'training'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Master Chen'],
    arcTitle: 'Robotics Genesis 2.0',
    metadata: { favorite: true }
  },
  {
    id: 'dummy-22',
    title: 'Writing Session at Coffee Shop with Emma',
    content: 'Spent the afternoon writing at the coffee shop with Emma Thompson. The words flowed effortlessly today, and I found myself exploring themes about transformation and creative identity. Emma gave me great feedback - she\'s from the writing group Sophia introduced me to. Writing feels like another piece of my creative puzzle. I\'m working on a short story about leaving tech for creative work. It\'s therapeutic.',
    date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['coffee-shop', 'writing', 'creativity', 'friendship'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Emma Thompson', 'Sophia Anderson'],
    sagaTitle: 'Creative Renaissance'
  },
  {
    id: 'dummy-23',
    title: 'Networking Event Success',
    content: 'Attended a tech networking event and made several meaningful connections. Met someone working on a project similar to mine - we\'re planning to collaborate.',
    date: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['networking', 'professional', 'collaboration', 'connections'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    arcTitle: 'Professional Development'
  },
  {
    id: 'dummy-24',
    title: 'Meditation Practice Deepened',
    content: 'Had a profound meditation session this morning. Reached a state of clarity I haven\'t experienced in weeks. The practice is really deepening.',
    date: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['meditation', 'mindfulness', 'clarity', 'practice'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-25',
    title: 'Photography Adventure',
    content: 'Went on a photography adventure today, exploring parts of the city I\'ve never seen. Captured some incredible shots that really capture the essence of the moment.',
    date: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['photography', 'adventure', 'exploration', 'art'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['David Martinez'],
    sagaTitle: 'Creative Exploration'
  },
  {
    id: 'dummy-26',
    title: 'Book Club Discussion',
    content: 'Had an amazing book club discussion tonight. We explored themes of identity and transformation. The different perspectives everyone brought enriched the conversation.',
    date: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['books', 'discussion', 'literature', 'community'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Oliver Bennett'],
    sagaTitle: 'Learning & Growth'
  },
  {
    id: 'dummy-27',
    title: 'Fitness Milestone',
    content: 'Reached a new personal best in my fitness routine today. The consistency is paying off, and I can feel my strength and endurance improving.',
    date: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['fitness', 'milestone', 'health', 'progress'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-28',
    title: 'Music Collaboration',
    content: 'Worked on a new music project with Phoenix today. Their production skills are incredible, and we\'re creating something really special together.',
    date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music', 'collaboration', 'creativity', 'production'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Phoenix Black'],
    arcTitle: 'Creative Projects'
  },
  {
    id: 'dummy-29',
    title: 'Philosophy Discussion',
    content: 'Had a late-night philosophy discussion with Riley. We explored questions about existence, ethics, and the meaning of life. These conversations always leave me thinking.',
    date: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['philosophy', 'discussion', 'intellectual', 'friendship'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Riley Chen'],
    sagaTitle: 'Personal Connections'
  },
  {
    id: 'dummy-30',
    title: 'Hiking Adventure',
    content: 'Went on a challenging hike with Ethan today. The views from the summit were breathtaking, and the physical challenge was exactly what I needed.',
    date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['hiking', 'adventure', 'nature', 'exercise'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Ethan Walker'],
    sagaTitle: 'Outdoor Adventures'
  },
  {
    id: 'dummy-31',
    title: 'Art Gallery Visit',
    content: 'Visited the art gallery with Indigo today. Her insights into the pieces were fascinating, and I gained a new appreciation for visual art.',
    date: new Date(Date.now() - 105 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['art', 'gallery', 'culture', 'appreciation'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Indigo Moon'],
    sagaTitle: 'Creative Exploration'
  },
  {
    id: 'dummy-32',
    title: 'Career Advice Session',
    content: 'Had a career advice session with Dr. Michael Chen today. His insights into the industry and negotiation strategies were invaluable.',
    date: new Date(Date.now() - 110 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['career', 'advice', 'professional', 'guidance'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Dr. Michael Chen'],
    arcTitle: 'Professional Development'
  },
  {
    id: 'dummy-33',
    title: 'Beach Volleyball Match',
    content: 'Played beach volleyball with Lucas today. The sun, sand, and friendly competition made for a perfect afternoon.',
    date: new Date(Date.now() - 115 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['sports', 'beach', 'friendship', 'fun'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Lucas Wright'],
    sagaTitle: 'Recreation'
  },
  {
    id: 'dummy-34',
    title: 'Gaming Session',
    content: 'Had an epic gaming session with Casey today. Their strategic thinking always impresses me, and we make a great team.',
    date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['gaming', 'friendship', 'strategy', 'fun'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Casey Morgan'],
    sagaTitle: 'Recreation'
  },
  {
    id: 'dummy-35',
    title: 'Family Dinner',
    content: 'Had a wonderful family dinner tonight. The conversations were meaningful, and I\'m grateful for these moments of connection.',
    date: new Date(Date.now() - 125 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['family', 'dinner', 'connection', 'gratitude'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Jordan Kim', 'Linda Chen'],
    sagaTitle: 'Family Time'
  },
  {
    id: 'dummy-36',
    title: 'Research Paper Published',
    content: 'My research paper was published today! This has been months in the making, and seeing it in print is incredibly rewarding.',
    date: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['research', 'academic', 'achievement', 'publication'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Dr. Rachel Kim'],
    arcTitle: 'Academic Pursuits',
    metadata: { favorite: true }
  }
];

export const MemoryExplorer = () => {
  const { isMockDataEnabled } = useMockData();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  
  // Memory Explorer state
  const [memories, setMemories] = useState<MemoryCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'book'>('book');
  const [selectedTab, setSelectedTab] = useState('all');
  const { entries = [], chapters = [], timeline, refreshEntries, refreshTimeline } = useLoreKeeper();

  // Memory Review Queue hook
  const { proposals, loading: proposalsLoading, error: proposalsError, refetch: refetchProposals, approveProposal, rejectProposal } = useMemoryReviewQueue();

  // Register mock data with service on mount
  useEffect(() => {
    mockDataService.register.memories(dummyMemoryCards);
    mockDataService.register.memoryProposals(MOCK_MEMORY_PROPOSALS);
  }, []);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ entries: Array<{
        id: string;
        date: string;
        content: string;
        summary?: string | null;
        tags: string[];
        mood?: string | null;
        chapter_id?: string | null;
        source: string;
        metadata?: Record<string, unknown>;
      }> }>('/api/entries/recent?limit=100');
      const cards = response.entries.map(memoryEntryToCard);
      
      // Use mock data service to determine what to show - pass current toggle state
      const result = mockDataService.getWithFallback.memories(
        cards.length > 0 ? cards : null,
        isMockDataEnabled
      );
      
      setMemories(result.data);
      setAllMemories(result.data);
    } catch {
      // On error, use mock data if enabled
      const result = mockDataService.getWithFallback.memories(null, isMockDataEnabled);
      setMemories(result.data);
      setAllMemories(result.data);
    } finally {
      setLoading(false);
    }
  };

  // Load memories on mount and when mock data toggle changes
  useEffect(() => {
    void loadMemories();
  }, [isMockDataEnabled]);

  useEffect(() => {
    const memoryCards = entries.map(entry => memoryEntryToCard({
      id: entry.id,
      date: entry.date,
      content: entry.content,
      summary: entry.summary || null,
      tags: entry.tags || [],
      mood: entry.mood || null,
      chapter_id: entry.chapter_id || null,
      source: entry.source || 'manual',
      metadata: entry.metadata || {}
    }));
    setAllMemories(memoryCards);
    // Use real data if available, otherwise use dummy data
    if (memoryCards.length > 0) {
      setMemories(memoryCards);
    } else {
      setMemories(dummyMemoryCards);
      setAllMemories(dummyMemoryCards);
    }
  }, [entries]);

  const filteredMemories = useMemo(() => {
    let mems = memories;

    if (selectedTab === 'recent') {
      // Show most recent first (already sorted by date)
      mems = [...mems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (selectedTab === 'by-tag') {
      // Group by most common tags
      mems = mems;
    } else if (selectedTab === 'by-mood') {
      // Group by mood
      mems = mems.filter(m => m.mood);
    } else if (selectedTab === 'by-source') {
      // Group by source
      mems = mems;
    } else if (selectedTab === 'favorites') {
      // Filter by favorites (if metadata has favorite flag)
      mems = mems.filter(m => m.metadata?.favorite === true);
    }

    if (!searchTerm.trim()) return mems;
    const term = searchTerm.toLowerCase();
    return mems.filter(
      (mem) =>
        mem.title?.toLowerCase().includes(term) ||
        mem.content.toLowerCase().includes(term) ||
        mem.tags.some((t) => t.toLowerCase().includes(term)) ||
        mem.characters?.some((c) => c.toLowerCase().includes(term))
    );
  }, [memories, searchTerm, selectedTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, viewMode, selectedTab]);

  const totalPages = Math.ceil(filteredMemories.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedMemories = filteredMemories.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  // Debounced search (for semantic/keyword search)
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch();
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [query]);


  const performSearch = async () => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      // Parallel searches
      const [semanticResults, keywordResults] = await Promise.all([
        // Semantic search via HQI
        fetchJson<{ results: HQIResult[] }>('/api/hqi/search', {
          method: 'POST',
          body: JSON.stringify({ query, filters: {} })
        }).catch(() => ({ results: [] })),
        // Keyword search
        (async () => {
          const params = new URLSearchParams();
          params.append('query', query);
          params.append('limit', '20');

          const response = await fetchJson<{ entries: Array<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }> }>(`/api/entries/search/keyword?${params.toString()}`);
          return response.entries || [];
        })()
      ]);

      // Convert semantic results to memory cards
      const semanticCards: MemoryCard[] = [];
      for (const result of semanticResults.results.slice(0, 10)) {
        try {
          // Fetch full entry details
          const entryResponse = await fetchJson<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }>(`/api/entries/${result.node_id}`).catch(() => null);
          if (entryResponse) {
            semanticCards.push(memoryEntryToCard(entryResponse));
          }
        } catch (error) {
          console.error('Failed to fetch semantic result entry:', error);
        }
      }

      // Convert keyword results to memory cards
      const keywordCards = keywordResults.map(memoryEntryToCard);

      // Get related clusters for top semantic matches
      const topMemoryIds = semanticCards.slice(0, 5).map(c => c.id);
      let clusterResults: MemorySearchResult[] = [];
      if (topMemoryIds.length > 0) {
        try {
          const clustersResponse = await fetchJson<{ clusters: Array<{ type: string; label: string; memories: Array<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }> }> }>(
            '/api/entries/clusters',
            {
              method: 'POST',
              body: JSON.stringify({ memoryIds: topMemoryIds, limit: 10 })
            }
          );

          clusterResults = clustersResponse.clusters.map(cluster => ({
            type: 'cluster' as const,
            memories: cluster.memories.map(memoryEntryToCard),
            clusterLabel: cluster.label,
            clusterReason: `Related by ${cluster.type}`
          }));
        } catch (error) {
          console.error('Failed to load clusters:', error);
        }
      }

      // Combine results
      const results: MemorySearchResult[] = [];

      if (semanticCards.length > 0) {
        results.push({
          type: 'semantic',
          memories: semanticCards
        });
      }

      if (keywordCards.length > 0) {
        results.push({
          type: 'keyword',
          memories: keywordCards
        });
      }

      results.push(...clusterResults);

      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const isSearchMode = query.trim().length > 0;

  // Get all memories for navigation (from search results or book)
  const allMemoriesForNavigation = useMemo(() => {
    if (isSearchMode) {
      return searchResults.flatMap(result => result.memories);
    }
    return allMemories;
  }, [isSearchMode, searchResults, allMemories]);

  const handleNavigateMemory = (memoryId: string) => {
    const memory = allMemoriesForNavigation.find(m => m.id === memoryId);
    if (memory) {
      setSelectedMemory(memory);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Results Section - Only show when searching */}
      {isSearchMode && searchResults.length > 0 && (
        <div className="space-y-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Search Results
            </h2>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {searchResults.reduce((sum, r) => sum + r.memories.length, 0)} results
            </Badge>
          </div>
          
          {searchResults.map((result, idx) => (
            <div key={idx} className="space-y-4">
              {/* Section Header */}
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">
                  {result.type === 'semantic' && (
                    <>
                      <Sparkles className="h-5 w-5 inline-block mr-2 text-primary" />
                      Semantic Matches
                    </>
                  )}
                  {result.type === 'keyword' && (
                    <>
                      <Search className="h-5 w-5 inline-block mr-2 text-primary" />
                      Keyword Matches
                    </>
                  )}
                  {result.type === 'cluster' && (
                    <>
                      <Sparkles className="h-5 w-5 inline-block mr-2 text-primary" />
                      {result.clusterLabel || 'Related Clusters'}
                    </>
                  )}
                </h3>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {result.memories.length}
                </Badge>
                {result.clusterReason && (
                  <span className="text-xs text-white/50">{result.clusterReason}</span>
                )}
              </div>

              {/* Memory Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.memories.map((memory) => (
                  <MemoryCardComponent
                    key={memory.id}
                    memory={memory}
                    showLinked={true}
                    expanded={expandedCardId === memory.id}
                    onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                    onSelect={() => setSelectedMemory(memory)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isSearchMode && searchResults.length === 0 && !searchLoading && (
        <div className="text-center py-12 text-white/60 mb-8">
          <p className="text-lg font-medium mb-2">No results found</p>
          <p className="text-sm">Try rephrasing your search or use different keywords</p>
        </div>
      )}

      {/* Memory Explorer - Always visible as the main view, styled like CharacterBook/LocationBook */}
      {!isSearchMode && (
        <div className="space-y-6">
          {/* Memory Search Bar and Controls */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="text"
                placeholder="Search memories by content, tags, characters, or date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40 text-sm sm:text-base"
              />
            </div>
            
            {/* Navigation Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
              <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex flex-wrap gap-1">
                <TabsTrigger value="all" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4" /> <span>All</span>
                </TabsTrigger>
                <TabsTrigger value="recent" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" /> <span>Recent</span>
                </TabsTrigger>
                <TabsTrigger value="by-tag" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <Tag className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">By Tag</span><span className="sm:hidden">Tag</span>
                </TabsTrigger>
                <TabsTrigger value="by-mood" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <Heart className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">By Mood</span><span className="sm:hidden">Mood</span>
                </TabsTrigger>
                <TabsTrigger value="by-source" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">By Source</span><span className="sm:hidden">Source</span>
                </TabsTrigger>
                <TabsTrigger value="favorites" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <Heart className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Favorites</span><span className="sm:hidden">Fav</span>
                </TabsTrigger>
                <TabsTrigger value="pending-review" className="flex items-center gap-1 sm:gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
                  <ClipboardCheck className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Pending Review</span><span className="sm:hidden">Review</span>
                  {proposals.length > 0 && (
                    <span className="ml-1 px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-xs bg-red-500/20 text-red-400 rounded-full border border-red-500/50">
                      {proposals.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value={selectedTab} className="mt-4">
                {selectedTab === 'pending-review' ? (
                  // Memory Review Queue Tab
                  <div className="space-y-6">
                    {/* Header Info */}
                    <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-1">Memory Review Queue</h3>
                          <p className="text-sm text-white/70">
                            These are memory proposals that need your review. Low-risk items are auto-approved, 
                            but medium and high-risk items require your decision. Your choices help the system learn your preferences and improve over time.
                          </p>
                        </div>
                      </div>
                    </div>

                    {proposalsLoading ? (
                      <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="mt-4 text-white/60">Loading memory proposals...</p>
                      </div>
                    ) : proposalsError ? (
                      <div className="text-center py-12">
                        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
                        <p className="text-red-400 mb-2">Failed to load proposals</p>
                        <p className="text-sm text-white/60 mb-4">{proposalsError}</p>
                        <button
                          onClick={() => void refetchProposals()}
                          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    ) : proposals.length === 0 ? (
                      <div className="text-center py-12 border border-border/60 rounded-lg bg-black/20">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
                        <p className="text-white/60 mb-2">No pending proposals</p>
                        <p className="text-sm text-white/40">
                          All memory proposals have been reviewed, or no new proposals have been generated yet.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-red-400">
                              {proposals.filter(p => p.risk_level === 'HIGH').length}
                            </div>
                            <div className="text-xs text-white/60">High Risk</div>
                          </div>
                          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-yellow-400">
                              {proposals.filter(p => p.risk_level === 'MEDIUM').length}
                            </div>
                            <div className="text-xs text-white/60">Medium Risk</div>
                          </div>
                          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-green-400">
                              {proposals.filter(p => p.risk_level === 'LOW').length}
                            </div>
                            <div className="text-xs text-white/60">Low Risk</div>
                          </div>
                        </div>

                        {/* Proposals List - Ordered by Risk */}
                        <div className="space-y-4">
                          {proposals.filter(p => p.risk_level === 'HIGH').length > 0 && (
                            <div>
                              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-red-400" />
                                High Risk ({proposals.filter(p => p.risk_level === 'HIGH').length})
                              </h3>
                              <div className="space-y-3">
                                {proposals.filter(p => p.risk_level === 'HIGH').map(proposal => (
                                  <ProposalCard 
                                    key={proposal.id} 
                                    proposal={proposal} 
                                    onAction={refetchProposals}
                                    onApprove={approveProposal}
                                    onReject={rejectProposal}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {proposals.filter(p => p.risk_level === 'MEDIUM').length > 0 && (
                            <div>
                              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                                Medium Risk ({proposals.filter(p => p.risk_level === 'MEDIUM').length})
                              </h3>
                              <div className="space-y-3">
                                {proposals.filter(p => p.risk_level === 'MEDIUM').map(proposal => (
                                  <ProposalCard 
                                    key={proposal.id} 
                                    proposal={proposal} 
                                    onAction={refetchProposals}
                                    onApprove={approveProposal}
                                    onReject={rejectProposal}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {proposals.filter(p => p.risk_level === 'LOW').length > 0 && (
                            <div>
                              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <Info className="h-5 w-5 text-green-400" />
                                Low Risk ({proposals.filter(p => p.risk_level === 'LOW').length})
                              </h3>
                              <div className="space-y-3">
                                {proposals.filter(p => p.risk_level === 'LOW').map(proposal => (
                                  <ProposalCard 
                                    key={proposal.id} 
                                    proposal={proposal} 
                                    onAction={refetchProposals}
                                    onApprove={approveProposal}
                                    onReject={rejectProposal}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  // Regular Memory Display Tabs
                  <>
                    {loading ? (
                      <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <Card key={i} className="bg-black/40 border-border/50 h-48 animate-pulse" />
                        ))}
                      </div>
                    ) : filteredMemories.length === 0 ? (
                      <div className="text-center py-8 sm:py-12 text-white/60 px-4">
                        <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-white/20" />
                        <p className="text-base sm:text-lg font-medium mb-2">No memories found</p>
                        <p className="text-xs sm:text-sm">Try a different search term or create new journal entries</p>
                      </div>
                    ) : (
                      <>
                        {/* Book Page Container with Grid Inside */}
                        <div className="relative w-full min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gradient-to-br from-amber-50/5 via-amber-100/5 to-amber-50/5 rounded-lg border-2 border-amber-800/30 shadow-2xl overflow-hidden">
                          {/* Page Content */}
                          <div className="p-4 sm:p-6 lg:p-8 flex flex-col">
                            {/* Page Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-amber-800/20">
                              <div className="flex items-center gap-2 sm:gap-3">
                                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600/60 flex-shrink-0" />
                                <div className="min-w-0">
                                  <h3 className="text-xs sm:text-sm font-semibold text-amber-900/40 uppercase tracking-wider">
                                    Memory Explorer
                                  </h3>
                                  <p className="text-[10px] sm:text-xs text-amber-700/50 mt-0.5">
                                    Page {currentPage}/{totalPages} · {filteredMemories.length} memories
                                  </p>
                                </div>
                              </div>
                              <div className="text-[10px] sm:text-xs text-amber-700/40 font-mono flex-shrink-0">
                                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </div>

                            {/* Memory Grid */}
                            <div className="flex-1 grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              {paginatedMemories.map((memory, index) => {
                                try {
                                  return (
                                    <MemoryCardComponent
                                      key={memory.id || `mem-${index}`}
                                      memory={memory}
                                      showLinked={true}
                                      expanded={false}
                                      onToggleExpand={() => {}}
                                      onSelect={() => setSelectedMemory(memory)}
                                    />
                                  );
                                } catch {
                                  return null;
                                }
                              })}
                            </div>

                            {/* Page Footer with Navigation - Pushed to bottom */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 pt-3 sm:pt-4 border-t border-amber-800/20">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={goToPrevious}
                                disabled={currentPage === 1}
                                className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30 w-full sm:w-auto text-xs sm:text-sm"
                              >
                                <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                Previous
                              </Button>

                              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-1 sm:gap-2 flex-wrap justify-center">
                                {/* Page indicators */}
                                <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1 bg-black/40 rounded-lg border border-amber-800/30 overflow-x-auto">
                                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalPages <= 7) {
                                      pageNum = i + 1;
                                    } else if (currentPage <= 4) {
                                      pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 3) {
                                      pageNum = totalPages - 6 + i;
                                    } else {
                                      pageNum = currentPage - 3 + i;
                                    }

                                    return (
                                      <button
                                        key={pageNum}
                                        onClick={() => goToPage(pageNum)}
                                        className={`px-1.5 sm:px-2 py-1 rounded text-xs sm:text-sm transition touch-manipulation ${
                                          currentPage === pageNum
                                            ? 'bg-amber-600 text-white'
                                            : 'text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10'
                                        }`}
                                      >
                                        {pageNum}
                                      </button>
                                    );
                                  })}
                                </div>
                                <span className="text-xs sm:text-sm text-amber-700/50 whitespace-nowrap">
                                  {startIndex + 1}-{Math.min(endIndex, filteredMemories.length)} of {filteredMemories.length}
                                </span>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={goToNext}
                                disabled={currentPage === totalPages}
                                className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30 w-full sm:w-auto text-xs sm:text-sm"
                              >
                                Next
                                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
                              </Button>
                            </div>
                          </div>

                          {/* Book Binding Effect */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
                        </div>
                      </>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
            
            <div className="flex items-center justify-between mt-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Memory Explorer</h2>
                <p className="text-sm text-white/60 mt-1">
                  {selectedTab === 'pending-review' 
                    ? `${proposals.length} proposal${proposals.length !== 1 ? 's' : ''} pending review`
                    : `${filteredMemories.length} memories · ${filteredMemories.length} shown${totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ''}${loading ? ' · Loading...' : ''}`
                  }
                </p>
              </div>
              {selectedTab !== 'pending-review' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === 'book' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('book')}
                    leftIcon={<BookOpen className="h-4 w-4" />}
                  >
                    Book
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    leftIcon={<LayoutGrid className="h-4 w-4" />}
                  >
                    Grid
                  </Button>
                  <Button 
                    leftIcon={<RefreshCw className="h-4 w-4" />} 
                    onClick={() => void loadMemories()}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Refresh'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Horizontal Timeline Component - Always at bottom */}
          <div className="mt-8 pt-6 border-t border-border/50">
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                Timeline
              </h3>
              <p className="text-sm text-white/60 mt-1">
                {chapters.length > 0 || entries.length > 0
                  ? `View your story timeline with ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} and ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`
                  : 'Your timeline will appear here as you create chapters and entries'}
              </p>
            </div>
            <Card className="bg-black/40 border-border/60 overflow-hidden">
              <CardContent className="p-0 overflow-x-hidden">
                <div className="overflow-x-auto overflow-y-hidden">
                  <ColorCodedTimeline
                    chapters={chapters.length > 0 ? chapters.map(ch => ({
                      id: ch.id,
                      title: ch.title,
                      start_date: ch.start_date || ch.startDate || new Date().toISOString(),
                      end_date: ch.end_date || ch.endDate || null,
                      description: ch.description || null,
                      summary: ch.summary || null
                    })) : []}
                    entries={entries.length > 0 ? entries.map(entry => ({
                      id: entry.id,
                      content: entry.content,
                      date: entry.date,
                      chapter_id: entry.chapter_id || entry.chapterId || null
                    })) : []}
                    useDummyData={chapters.length === 0 && entries.length === 0}
                    showLabel={true}
                    onItemClick={async (item) => {
                      if (item.type === 'entry' || item.entryId || (item.id && entries.some(e => e.id === item.id))) {
                        const entryId = item.entryId || item.id;
                        const entry = entries.find(e => e.id === entryId);
                        if (entry) {
                          const memoryCard = memoryEntryToCard({
                            id: entry.id,
                            date: entry.date,
                            content: entry.content,
                            summary: entry.summary || null,
                            tags: entry.tags || [],
                            mood: entry.mood || null,
                            chapter_id: entry.chapter_id || null,
                            source: entry.source || 'manual',
                            metadata: entry.metadata || {}
                          });
                          setSelectedMemory(memoryCard);
                        } else {
                          try {
                            const fetchedEntry = await fetchJson<{
                              id: string;
                              date: string;
                              content: string;
                              summary?: string | null;
                              tags: string[];
                              mood?: string | null;
                              chapter_id?: string | null;
                              source: string;
                              metadata?: Record<string, unknown>;
                            }>(`/api/entries/${entryId}`);
                            const memoryCard = memoryEntryToCard(fetchedEntry);
                            setSelectedMemory(memoryCard);
                          } catch (error) {
                            console.error('Failed to load entry:', error);
                          }
                        }
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={handleNavigateMemory}
          allMemories={allMemoriesForNavigation}
        />
      )}
    </div>
  );
};

