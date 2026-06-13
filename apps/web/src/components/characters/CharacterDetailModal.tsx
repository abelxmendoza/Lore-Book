import { useState, useEffect, useRef } from 'react';
import { CharacterPerceptionsTab } from '../perceptions/CharacterPerceptionsTab';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, TrendingUp, TrendingDown, Minus, Heart, Star, Zap, BarChart3, Lightbulb, Award, User, Hash, Info, Link2, Eye, Building2, UserCircle, TreePine, AlertCircle, AlertTriangle, Briefcase, DollarSign, Activity, Smile, Heart as HeartIcon, Home, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { RelationshipTreeView } from '../relationshipTree/RelationshipTreeView';
import { FamilyTreeView, createMockFamilyTreeForCharacter, createMockUserFamilyTree } from '../family/FamilyTreeView';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage, type Message } from '../../features/chat/message/ChatMessage';
import { OrganizationDetailModal } from '../organizations/OrganizationDetailModal';
import type { Organization } from '../organizations/OrganizationProfileCard';
import { LocationDetailModal, type LocationProfile } from '../locations/LocationDetailModal';
import { PerceptionDetailModal } from '../perceptions/PerceptionDetailModal';
import { fetchJson } from '../../lib/api';
import { UnknownField } from '../ui/UnknownField';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { Character } from './CharacterProfileCard';
import { CharacterAvatar } from './CharacterAvatar';
import { useMockData } from '../../contexts/MockDataContext';
import type { PerceptionEntry } from '../../types/perception';
import { EntityProvenancePanel } from './EntityProvenancePanel';
import { ContradictionResolutionPanel } from './ContradictionResolutionPanel';

type SocialMedia = {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  email?: string;
  phone?: string;
};

type Relationship = {
  id?: string;
  character_id: string;
  character_name?: string;
  relationship_type: string;
  closeness_score?: number;
  summary?: string;
  status?: string;
};

type CharacterAttribute = {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
  evidence?: string;
  startTime?: string;
  endTime?: string;
};

type CharacterDetail = Character & {
  first_name?: string | null;
  last_name?: string | null;
  importance_level?: 'protagonist' | 'major' | 'supporting' | 'minor' | 'background' | null;
  importance_score?: number | null;
  is_nickname?: boolean | null;
  proximity_level?: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party' | null;
  has_met?: boolean | null;
  relationship_depth?: 'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only' | null;
  associated_with_character_ids?: string[] | null;
  mentioned_by_character_ids?: string[] | null;
  context_of_mention?: string | null;
  likelihood_to_meet?: 'likely' | 'possible' | 'unlikely' | 'never' | null;
  social_media?: SocialMedia;
  relationships?: Relationship[];
  shared_memories?: Array<{
    id: string;
    entry_id: string;
    date: string;
    summary?: string;
  }>;
};

type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
};

type CharacterDetailModalProps = {
  character: Character;
  onClose: () => void;
  onUpdate: () => void;
  relationship?: RomanticRelationship;
};

type TabKey = 'info' | 'social' | 'relationships' | 'perceptions' | 'history' | 'chat' | 'insights' | 'metadata' | 'knowledge' | 'intelligence';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info',         label: 'Info',            icon: FileText },
  { key: 'intelligence', label: 'Intelligence',    icon: Zap },
  { key: 'knowledge',    label: 'What I Know',     icon: Brain },
  { key: 'chat',         label: 'Chat',            icon: MessageSquare },
  { key: 'relationships', label: 'Connections',   icon: Network },
  { key: 'history',      label: 'History',         icon: Calendar },
  { key: 'insights',     label: 'Insights',        icon: BarChart3 },
  { key: 'perceptions',  label: 'Perceptions',     icon: Eye },
  { key: 'social',       label: 'Social',          icon: Globe },
  { key: 'metadata',     label: 'Metadata',        icon: Database },
];

export const CharacterDetailModal = ({ character, onClose, onUpdate, relationship }: CharacterDetailModalProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [editedCharacter, setEditedCharacter] = useState<CharacterDetail>(character as CharacterDetail);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const getImportanceColor = (level?: string | null) => {
    const colors: Record<string, string> = {
      'protagonist': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      'major': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
      'supporting': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      'minor': 'bg-gray-500/20 text-gray-400 border-gray-500/40',
      'background': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    return colors[level || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/40';
  };

  const getImportanceIcon = (level?: string | null) => {
    switch (level) {
      case 'protagonist':
        return <Star className="h-4 w-4" />;
      case 'major':
        return <Award className="h-4 w-4" />;
      case 'supporting':
        return <User className="h-4 w-4" />;
      case 'minor':
        return <Hash className="h-4 w-4" />;
      default:
        return <Hash className="h-4 w-4" />;
    }
  };

  const deleteCharacter = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await fetchJson(`/api/characters/${character.id}`, { method: 'DELETE' });
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to delete character:', err);
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete character');
    } finally {
      setDeleteBusy(false);
    }
  };

  const getImportanceLabel = (level?: string | null) => {
    switch (level) {
      case 'protagonist':
        return 'Protagonist';
      case 'major':
        return 'Major';
      case 'supporting':
        return 'Supporting';
      case 'minor':
        return 'Minor';
      case 'background':
        return 'Background';
      default:
        return 'Unknown';
    }
  };

  // Tooltip content generators for badges
  const getStatusTooltip = (status?: string | null) => {
    switch (status) {
      case 'active':
        return 'Active: This character is currently part of your ongoing story. They appear frequently in recent conversations and events.';
      case 'inactive':
        return 'Inactive: This character hasn\'t been mentioned recently. They may have faded from your current narrative but remain in your memory.';
      case 'archived':
        return 'Archived: This character has been archived, likely because they\'re no longer relevant to your current life story.';
      default:
        return 'Status: Character status is automatically determined based on how recently and frequently they appear in your conversations.';
    }
  };

  const getImportanceTooltip = (level?: string | null, score?: number | null, influenceOnUser?: number) => {
    const scoreText = score !== null && score !== undefined ? ` (Score: ${Math.round(score)}/100)` : '';
    const lowPresence = level === 'minor' || level === 'background';
    const highImpact = (influenceOnUser ?? 0) >= 70;
    let base: string;
    switch (level) {
      case 'protagonist':
        base = `Protagonist${scoreText}: This character is central to your story. They appear frequently, have deep relationships with you, and significantly impact your narrative. Assigned based on mention frequency, relationship depth, and emotional significance.`;
        break;
      case 'major':
        base = `Major${scoreText}: This character plays an important role in your story. They appear regularly and have meaningful connections. Assigned based on consistent mentions and relationship significance.`;
        break;
      case 'supporting':
        base = `Supporting${scoreText}: This character appears occasionally and contributes to your story. They have moderate significance. Assigned based on periodic mentions and moderate relationship depth.`;
        break;
      case 'minor':
        base = `Minor${scoreText}: This character appears infrequently in your story. Assigned based on rare mentions or shallow relationship depth.`;
        break;
      case 'background':
        base = `Background${scoreText}: This character is mentioned but appears rarely in your story. They're part of the background context. Assigned based on very rare mentions or third-party references.`;
        break;
      default:
        base = `Importance Level${scoreText}: Automatically calculated based on how often you mention this character, the depth of your relationship, and their role in your story.`;
    }
    if (lowPresence && highImpact && influenceOnUser != null) {
      return `${base} Despite low presence in your story, they have high impact on you (influence: ${influenceOnUser}/100).`;
    }
    return base;
  };

  const getProximityTooltip = (level?: string | null) => {
    switch (level) {
      case 'direct':
        return 'Direct: You know this person directly and have personal interactions with them. This is assigned when you mention direct conversations, meetings, or shared experiences.';
      case 'indirect':
        return 'Indirect: You know this person through someone else. They\'re connected to you through mutual relationships. Assigned when mentioned in context of other people you know.';
      case 'distant':
        return 'Distant: You barely know this person. You may have met them once or know them only superficially. Assigned based on limited mentions or casual references.';
      case 'unmet':
        return 'Unmet: You haven\'t met this person yet, but they\'ve been mentioned in your conversations. They exist in your story but not in your direct experience.';
      case 'third_party':
        return 'Third Party: This person was mentioned by others but you don\'t know them personally. They\'re part of someone else\'s story that you\'re aware of.';
      default:
        return 'Proximity: Tracks how directly you know this person, automatically determined from how you mention them in conversations.';
    }
  };

  const getRelationshipDepthTooltip = (depth?: string | null) => {
    switch (depth) {
      case 'close':
        return 'Close: You have a deep, meaningful relationship with this person. Assigned based on frequent mentions, emotional language, shared experiences, and significant interactions.';
      case 'moderate':
        return 'Moderate: You have a meaningful but not deeply intimate relationship. Assigned based on regular but not frequent mentions and moderate emotional connection.';
      case 'casual':
        return 'Casual: You have a friendly but not deep relationship. Assigned based on occasional mentions and light interactions.';
      case 'acquaintance':
        return 'Acquaintance: You know this person but aren\'t close. Assigned based on infrequent mentions and minimal relationship depth.';
      case 'mentioned_only':
        return 'Mentioned Only: This person has been mentioned but you don\'t have an established relationship. Assigned when they appear in conversations but lack relationship indicators.';
      default:
        return 'Relationship Depth: Automatically determined from the frequency and emotional tone of your interactions with this person.';
    }
  };

  const getLikelihoodToMeetTooltip = (likelihood?: string | null) => {
    switch (likelihood) {
      case 'very_likely':
        return 'Very Likely: Based on your conversations, you\'re very likely to meet this person soon. Assigned when you mention plans, upcoming events, or strong intentions to meet.';
      case 'likely':
        return 'Likely: There\'s a good chance you\'ll meet this person. Assigned when you mention potential meetings or moderate connection opportunities.';
      case 'possible':
        return 'Possible: Meeting this person is possible but not certain. Assigned when there are some connection points but no concrete plans.';
      case 'unlikely':
        return 'Unlikely: It\'s unlikely you\'ll meet this person. Assigned when there are few or no connection opportunities mentioned.';
      case 'very_unlikely':
        return 'Very Unlikely: It\'s very unlikely you\'ll meet this person. Assigned when they\'re distant, third-party, or there are no connection paths.';
      default:
        return 'Likelihood to Meet: Estimated based on your proximity level, relationship context, and mentions of potential meetings or connections.';
    }
  };

  const getNicknameTooltip = () => {
    return 'Nickname: This display name is a nickname rather than their formal name. The system detected this from your conversations when you consistently use a different name than their full name.';
  };

  const getAliasTooltip = (alias: string) => {
    return `Alias/Nickname: "${alias}" is an alternative name you use for this person. The system learned this from your conversations when you refer to them by different names.`;
  };

  const getRoleTooltip = (role?: string | null) => {
    return `Role: "${role}" describes this person's role in your life or story. This is automatically detected from how you describe them in conversations, such as "my friend", "colleague", "family member", etc.`;
  };

  const getArchetypeTooltip = (archetype?: string | null) => {
    return `Archetype: "${archetype}" represents the archetypal role this person plays in your narrative. This is inferred from patterns in your conversations, their influence on you, and the nature of your relationship.`;
  };

  const getPronounsTooltip = (pronouns?: string | null) => {
    return `Pronouns: "${pronouns}" are the pronouns this person uses. This is learned from your conversations when you mention their pronouns or refer to them using specific pronouns.`;
  };

  const getTagTooltip = (tag: string) => {
    return `Tag: "${tag}" is a theme or category associated with this character. Tags are automatically extracted from your conversations to help organize and understand the context of your relationships.`;
  };

  const getSharedBadgeTooltip = () => {
    return 'Shared: You and this character both belong to this group or organization. This is determined by detecting when you mention both yourself and this character in the context of the same group.';
  };

  const getNotSharedBadgeTooltip = () => {
    return 'Not Shared: This character belongs to this group or organization, but you don\'t. This is determined when you mention the character\'s affiliation without indicating your own membership.';
  };

  const getRelationshipTrendTooltip = (trend: string) => {
    switch (trend) {
      case 'deepening':
        return 'Deepening: Your relationship with this person is growing stronger over time. This is detected by analyzing increasing mention frequency, more positive sentiment, and growing relationship depth scores.';
      case 'weakening':
        return 'Weakening: Your relationship with this person may be fading. This is detected by decreasing mention frequency, less positive sentiment, or increasing time between interactions.';
      case 'stable':
        return 'Stable: Your relationship with this person has remained consistent. This is detected when mention frequency, sentiment, and relationship depth have remained relatively constant over time.';
      default:
        return 'Relationship Trend: Automatically calculated by analyzing changes in interaction frequency, sentiment, and relationship depth over time.';
    }
  };

  // Analytics metric tooltip generators
  const getClosenessScoreTooltip = (score: number, character: CharacterDetail) => {
    const relationship = character.relationships?.find(r => r.character_name === 'You' || !r.character_name);
    const closenessBase = relationship?.closeness_score || 0;
    const sharedCount = character.shared_memories?.length || 0;
    
    let explanation = `Closeness Score: ${score}%\n\n`;
    explanation += `This score is calculated from:\n`;
    explanation += `• Relationship closeness base: ${closenessBase}/10 (from relationship data)\n`;
    explanation += `• Shared experiences: ${sharedCount} memories/events together\n`;
    explanation += `• Emotional depth indicators from your conversations\n`;
    explanation += `• Frequency of positive interactions and mentions\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% indicates a very close relationship. You mention this person frequently, have deep emotional connections, and share many meaningful experiences together.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% indicates a close relationship. You have regular interactions and meaningful connections, though there's room to deepen the bond further.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% indicates a moderate closeness. The relationship is developing, with some shared experiences and growing connection.`;
    } else {
      explanation += `A score of ${score}% indicates a developing relationship. You're getting to know this person, but the connection is still forming.`;
    }
    
    return explanation;
  };

  const getImportanceScoreTooltip = (score: number, character: CharacterDetail) => {
    const importanceLevel = character.importance_level || 'unknown';
    const mentionCount = character.metadata?.mention_count || 0;
    const roleSignificance = character.role ? 'high' : 'moderate';
    
    let explanation = `Importance Score: ${score}%\n\n`;
    explanation += `This score reflects how central ${character.name} is to your story:\n`;
    explanation += `• Importance level: ${importanceLevel}\n`;
    explanation += `• Mention frequency: ${mentionCount > 0 ? `${mentionCount} mentions` : 'Based on relationship depth'}\n`;
    explanation += `• Role significance: ${roleSignificance}\n`;
    explanation += `• Relationship depth and emotional impact\n`;
    explanation += `• Impact on your decisions and life events\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means this person is central to your narrative. They appear frequently, influence your decisions, and significantly impact your story.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means this person plays an important role. They appear regularly and have meaningful influence on your life.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means this person has moderate importance. They contribute to your story but aren't central to it.`;
    } else {
      explanation += `A score of ${score}% means this person has lower importance. They appear occasionally but have limited impact on your narrative.`;
    }
    
    return explanation;
  };

  const getPriorityScoreTooltip = (score: number, character: CharacterDetail) => {
    const recency = character.shared_memories && character.shared_memories.length > 0 
      ? 'Recent interactions' 
      : 'No recent interactions';
    const urgency = score >= 70 ? 'High urgency' : score >= 50 ? 'Moderate urgency' : 'Low urgency';
    
    let explanation = `Priority Score: ${score}%\n\n`;
    explanation += `This score indicates how urgent or prioritized this relationship is:\n`;
    explanation += `• Interaction recency: ${recency}\n`;
    explanation += `• Urgency level: ${urgency}\n`;
    explanation += `• Pending conversations or plans\n`;
    explanation += `• Emotional significance in current context\n`;
    explanation += `• Active projects or shared goals\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means high priority. This relationship needs attention soon - there may be pending conversations, active projects, or time-sensitive matters.`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means moderate priority. The relationship is active and worth maintaining, but not urgent.`;
    } else {
      explanation += `A score of ${score}% means lower priority. The relationship is stable and doesn't require immediate attention.`;
    }
    
    return explanation;
  };

  const getEngagementScoreTooltip = (score: number, character: CharacterDetail) => {
    const interactionCount = character.shared_memories?.length || 0;
    const frequency = score >= 70 ? 'Very frequent' : score >= 50 ? 'Regular' : 'Occasional';
    
    let explanation = `Engagement Score: ${score}%\n\n`;
    explanation += `This score measures how actively you interact with ${character.name}:\n`;
    explanation += `• Interaction frequency: ${frequency}\n`;
    explanation += `• Total shared experiences: ${interactionCount}\n`;
    explanation += `• Conversation frequency in your chats\n`;
    explanation += `• Response time and engagement level\n`;
    explanation += `• Active participation in shared activities\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means very high engagement. You interact frequently, respond quickly, and actively participate in shared activities.`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means regular engagement. You maintain consistent interaction and stay connected.`;
    } else {
      explanation += `A score of ${score}% means occasional engagement. Interactions happen but aren't frequent or consistent.`;
    }
    
    return explanation;
  };

  const getAnalyticsRelationshipDepthTooltip = (score: number, sharedExperiences: number) => {
    let explanation = `Relationship Depth: ${score}%\n\n`;
    explanation += `This measures the emotional and experiential depth of your relationship:\n`;
    explanation += `• Shared experiences: ${sharedExperiences} memories/events\n`;
    explanation += `• Emotional intimacy indicators\n`;
    explanation += `• Depth of conversations and topics discussed\n`;
    explanation += `• Vulnerability and trust levels\n`;
    explanation += `• Long-term connection and history\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% indicates very deep connection. You share intimate experiences, have deep conversations, and trust each other significantly.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% indicates meaningful depth. You have substantial shared history and meaningful connections.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% indicates developing depth. The relationship is growing, with some meaningful experiences but room to deepen further.`;
    } else {
      explanation += `A score of ${score}% indicates surface-level connection. The relationship is still developing and hasn't reached deep levels yet.`;
    }
    
    return explanation;
  };

  const getInteractionFrequencyTooltip = (score: number) => {
    let explanation = `Interaction Frequency: ${score}%\n\n`;
    explanation += `This measures how often you interact with this person:\n`;
    explanation += `• Calculated over the last 90 days\n`;
    explanation += `• Based on mentions in conversations\n`;
    explanation += `• Shared events and memories\n`;
    explanation += `• Message frequency and response patterns\n`;
    explanation += `• Regular vs. sporadic interaction patterns\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means very frequent interaction. You connect multiple times per week, maintaining regular communication.`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means regular interaction. You connect weekly or bi-weekly, maintaining consistent contact.`;
    } else if (score >= 30) {
      explanation += `A score of ${score}% means occasional interaction. You connect monthly or less frequently.`;
    } else {
      explanation += `A score of ${score}% means infrequent interaction. Contact is rare or sporadic.`;
    }
    
    return explanation;
  };

  const getInfluenceTooltip = (score: number, type: 'their' | 'yours', characterName: string) => {
    const direction = type === 'their' ? 'Their influence on you' : 'Your influence over them';
    let explanation = `${direction}: ${score}%\n\n`;
    explanation += `This measures how much ${type === 'their' ? characterName + ' influences' : 'you influence ' + characterName}:\n`;
    explanation += `• Decision-making impact\n`;
    explanation += `• Opinion and perspective influence\n`;
    explanation += `• Emotional impact and support\n`;
    explanation += `• Behavioral changes or adaptations\n`;
    explanation += `• Advice seeking and giving patterns\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means ${type === 'their' ? 'strong influence' : 'you have strong influence'}. ${type === 'their' ? 'Their opinions and actions significantly impact your decisions and emotions.' : 'Your opinions and actions significantly impact their decisions and emotions.'}`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means ${type === 'their' ? 'moderate influence' : 'you have moderate influence'}. ${type === 'their' ? 'They have meaningful impact on your thoughts and choices.' : 'You have meaningful impact on their thoughts and choices.'}`;
    } else {
      explanation += `A score of ${score}% means ${type === 'their' ? 'limited influence' : 'you have limited influence'}. ${type === 'their' ? 'Their impact on you is minimal or developing.' : 'Your impact on them is minimal or developing.'}`;
    }
    
    return explanation;
  };

  const getSentimentScoreTooltip = (score: number) => {
    const isPositive = score >= 0;
    let explanation = `Sentiment Score: ${score > 0 ? '+' : ''}${score}\n\n`;
    explanation += `This measures the overall emotional tone of your relationship:\n`;
    explanation += `• Range: -100 (very negative) to +100 (very positive)\n`;
    explanation += `• Based on emotional language in conversations\n`;
    explanation += `• Positive vs. negative interaction patterns\n`;
    explanation += `• Conflict frequency and resolution\n`;
    explanation += `• Support and encouragement levels\n\n`;
    
    if (score >= 50) {
      explanation += `A score of ${score} indicates a very positive relationship. Interactions are consistently positive, supportive, and uplifting.`;
    } else if (score >= 20) {
      explanation += `A score of ${score} indicates a positive relationship. Most interactions are positive, with occasional neutral moments.`;
    } else if (score >= -20) {
      explanation += `A score of ${score} indicates a neutral to slightly ${isPositive ? 'positive' : 'negative'} relationship. Interactions are mixed, with both positive and challenging moments.`;
    } else {
      explanation += `A score of ${score} indicates a challenging relationship. There are more negative interactions than positive ones, suggesting tension or conflict.`;
    }
    
    return explanation;
  };

  const getTrustScoreTooltip = (score: number) => {
    let explanation = `Trust Score: ${score}%\n\n`;
    explanation += `This measures how much you trust this person:\n`;
    explanation += `• Reliability and consistency\n`;
    explanation += `• Confidentiality and discretion\n`;
    explanation += `• Honesty and transparency\n`;
    explanation += `• Vulnerability and sharing patterns\n`;
    explanation += `• Past behavior and dependability\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high trust. You trust them with sensitive information and rely on them significantly.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good trust. You trust them in most situations and feel comfortable sharing.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means developing trust. You're building trust but aren't fully comfortable yet.`;
    } else {
      explanation += `A score of ${score}% means low trust. You're cautious and haven't established strong trust yet.`;
    }
    
    return explanation;
  };

  const getSupportScoreTooltip = (score: number) => {
    let explanation = `Support Score: ${score}%\n\n`;
    explanation += `This measures how supportive this person is:\n`;
    explanation += `• Emotional support provided\n`;
    explanation += `• Practical help and assistance\n`;
    explanation += `• Encouragement and motivation\n`;
    explanation += `• Being there during difficult times\n`;
    explanation += `• Celebrating successes together\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high support. They're consistently there for you, offering both emotional and practical support.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good support. They provide meaningful support when needed.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate support. They offer support but it may be inconsistent.`;
    } else {
      explanation += `A score of ${score}% means limited support. Support is minimal or still developing.`;
    }
    
    return explanation;
  };

  const getConflictScoreTooltip = (score: number) => {
    let explanation = `Conflict Score: ${score}%\n\n`;
    explanation += `This measures the level of conflict in your relationship:\n`;
    explanation += `• Disagreement frequency\n`;
    explanation += `• Argument intensity\n`;
    explanation += `• Unresolved tensions\n`;
    explanation += `• Communication breakdowns\n`;
    explanation += `• Negative interaction patterns\n\n`;
    
    if (score >= 50) {
      explanation += `A score of ${score}% means high conflict. There are frequent disagreements, arguments, or unresolved tensions that need attention.`;
    } else if (score >= 30) {
      explanation += `A score of ${score}% means moderate conflict. Occasional disagreements occur but are usually resolved.`;
    } else if (score >= 15) {
      explanation += `A score of ${score}% means low conflict. Disagreements are rare and minor.`;
    } else {
      explanation += `A score of ${score}% means minimal conflict. The relationship is harmonious with very few disagreements.`;
    }
    
    return explanation;
  };

  const getValueScoreTooltip = (score: number) => {
    let explanation = `Value Score: ${score}%\n\n`;
    explanation += `This measures the value this person brings to your life:\n`;
    explanation += `• Personal growth and learning\n`;
    explanation += `• Joy and positive experiences\n`;
    explanation += `• Practical benefits and opportunities\n`;
    explanation += `• Emotional enrichment\n`;
    explanation += `• Overall life improvement\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high value. They significantly enrich your life and contribute to your growth and happiness.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good value. They bring meaningful positive contributions to your life.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate value. They add some value but it's not consistently high.`;
    } else {
      explanation += `A score of ${score}% means limited value. Their contribution to your life is minimal or still developing.`;
    }
    
    return explanation;
  };

  const getRelevanceScoreTooltip = (score: number) => {
    let explanation = `Relevance Score: ${score}%\n\n`;
    explanation += `This measures how relevant this person is to your current life:\n`;
    explanation += `• Current involvement in your life\n`;
    explanation += `• Recent interactions and mentions\n`;
    explanation += `• Connection to current goals/projects\n`;
    explanation += `• Present-day significance\n`;
    explanation += `• Active vs. historical relationship\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high relevance. They're actively involved in your current life and regularly appear in your present narrative.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good relevance. They're part of your current life, though not central to it.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate relevance. They appear occasionally but aren't central to your current life.`;
    } else {
      explanation += `A score of ${score}% means low relevance. They're more of a historical connection than a current active part of your life.`;
    }
    
    return explanation;
  };

  const getActivityLevelTooltip = (score: number) => {
    let explanation = `Activity Level: ${score}%\n\n`;
    explanation += `This measures how active this relationship is:\n`;
    explanation += `• Recent interaction frequency\n`;
    explanation += `• Communication patterns\n`;
    explanation += `• Shared activities and events\n`;
    explanation += `• Engagement in conversations\n`;
    explanation += `• Overall relationship momentum\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high activity. The relationship is very active with frequent interactions and ongoing engagement.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means high activity. The relationship is active with regular interactions.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate activity. Interactions happen but aren't frequent.`;
    } else {
      explanation += `A score of ${score}% means low activity. The relationship is relatively inactive with infrequent contact.`;
    }
    
    return explanation;
  };

  // Generate mock analytics data
  const generateMockAnalytics = (character: CharacterDetail) => {
    // Generate realistic mock data based on character properties
    const baseScore = character.importance_score || 50;
    const closenessBase = character.relationships?.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 5;
    
    return {
      closeness_score: Math.min(100, Math.round(closenessBase * 10 + Math.random() * 20)),
      importance_score: Math.round(baseScore),
      priority_score: Math.round(40 + Math.random() * 40),
      engagement_score: Math.round(50 + Math.random() * 40),
      relationship_depth: Math.round(60 + Math.random() * 30),
      interaction_frequency: Math.round(45 + Math.random() * 40),
      recency_score: Math.round(30 + Math.random() * 50),
      relevance_score: Math.round(50 + Math.random() * 40),
      value_score: Math.round(55 + Math.random() * 35),
      character_influence_on_user: Math.round(40 + Math.random() * 40),
      user_influence_over_character: Math.round(30 + Math.random() * 40),
      sentiment_score: Math.round(-20 + Math.random() * 80), // -20 to +60
      trust_score: Math.round(50 + Math.random() * 40),
      support_score: Math.round(45 + Math.random() * 45),
      conflict_score: Math.round(10 + Math.random() * 30),
      activity_level: Math.round(40 + Math.random() * 50),
      shared_experiences: character.shared_memories?.length || Math.round(5 + Math.random() * 15),
      relationship_duration_days: Math.round(30 + Math.random() * 300),
      trend: ['deepening', 'stable', 'weakening'][Math.floor(Math.random() * 3)] as 'deepening' | 'stable' | 'weakening',
      strengths: [
        'Strong communication',
        'Reliable and trustworthy',
        'Supportive during challenges',
        'Shared interests and values',
        'Positive influence on your growth'
      ].slice(0, Math.floor(Math.random() * 3) + 2),
      weaknesses: [
        'Occasional misunderstandings',
        'Different communication styles',
        'Limited time together'
      ].slice(0, Math.floor(Math.random() * 2) + 1),
      opportunities: [
        'Deepen connection through shared activities',
        'Build stronger trust through consistency',
        'Explore new experiences together'
      ].slice(0, Math.floor(Math.random() * 2) + 1),
      risks: [
        'Distance may affect closeness',
        'Miscommunication could strain relationship'
      ].slice(0, Math.floor(Math.random() * 1) + 1),
    };
  };

  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [sharedMemoryCards, setSharedMemoryCards] = useState<MemoryCard[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  // Unknown-field flow: clicking an Unknown chip jumps to the Chat tab with a
  // prefilled prompt — filling in unknowns is chat-first.
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  const askInChat = (prompt: string) => {
    setChatPrefill(prompt);
    setActiveTab('chat');
  };
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [characterOrganizations, setCharacterOrganizations] = useState<Array<Organization & { user_is_member: boolean; character_role?: string; character_member_notes?: string }>>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  const [selectedPerception, setSelectedPerception] = useState<PerceptionEntry | null>(null);
  const [selectedCharacterForModal, setSelectedCharacterForModal] = useState<Character | null>(null);
  const [characterAttributes, setCharacterAttributes] = useState<CharacterAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [knowledgeClaims, setKnowledgeClaims] = useState<any[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeLoaded, setKnowledgeLoaded] = useState(false);
  const [characterFacts, setCharacterFacts] = useState<any[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsLoaded, setFactsLoaded] = useState(false);
  const [sceneCandidates, setSceneCandidates] = useState<any[]>([]);
  const [scenesLoaded, setScenesLoaded] = useState(false);

  // ── Relationship Intelligence (dynamics + influence) ────────────────────────
  const [dynamics, setDynamics] = useState<any | null>(null);
  const [dynamicsLoading, setDynamicsLoading] = useState(false);
  const [dynamicsLoaded, setDynamicsLoaded] = useState(false);
  const [influenceProfile, setInfluenceProfile] = useState<any | null>(null);
  const [influenceInsights, setInfluenceInsights] = useState<any[]>([]);
  const [influenceLoading, setInfluenceLoading] = useState(false);
  const [influenceLoaded, setInfluenceLoaded] = useState(false);

  // ── Provenance ──────────────────────────────────────────────────────────────
  const [provenance, setProvenance] = useState<any | null>(null);
  const [provenanceLoaded, setProvenanceLoaded] = useState(false);

  // ── Temporal attributes (all historical, not just current) ─────────────────
  const [allAttributes, setAllAttributes] = useState<any[]>([]);
  const [allAttributesLoaded, setAllAttributesLoaded] = useState(false);

  // Character-specific mock organizations — shared (user is also a member) vs theirs only
  const getMockOrganizations = (): Array<Organization & { user_is_member: boolean; character_role?: string }> => {
    // Add G1 defaults to any mock org that pre-dates the canonical group model
    type RawMockOrg = Omit<Organization, 'group_type' | 'membership_model' | 'user_relationship' | 'is_public_entity'>
      & { user_is_member: boolean; character_role?: string; group_type?: Organization['group_type'] };
    const withG1 = (org: RawMockOrg): Organization & { user_is_member: boolean; character_role?: string } => ({
      group_type: (org.type as unknown as Organization['group_type']) ?? 'other',
      membership_model: 'strict',
      user_relationship: org.user_is_member ? 'member' : 'aware_of',
      is_public_entity: false,
      ...org,
    } as Organization & { user_is_member: boolean; character_role?: string });

    const SHARED: Record<string, Array<RawMockOrg>> = {
      'Sarah Chen': [
        { id: 'org-sc-1', name: 'Creative Writing Circle', aliases: [], type: 'club', description: 'Weekly writing sessions and story feedback', status: 'active', member_count: 6, usage_count: 18, confidence: 0.91, last_seen: new Date(Date.now() - 7*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Co-Founder', members: [{ id: '1', character_name: 'Sarah Chen', role: 'Co-Founder', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }, { id: '3', character_name: 'Emma Thompson', role: 'Member', status: 'active' }] },
        { id: 'org-sc-2', name: 'Tech Alumni Network', aliases: [], type: 'affiliation', description: 'Former colleagues from tech careers', status: 'active', member_count: 12, usage_count: 7, confidence: 0.78, last_seen: new Date(Date.now() - 30*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: 'Sarah Chen', role: 'Member', status: 'active' }] },
        { id: 'org-sc-3', name: 'Women in Product', aliases: [], type: 'affiliation', description: 'Professional community for women in product roles', status: 'active', member_count: 45, usage_count: 5, confidence: 0.82, last_seen: new Date(Date.now() - 14*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Member', members: [{ id: '1', character_name: 'Sarah Chen', role: 'Member', status: 'active' }] },
      ],
      'Marcus Johnson': [
        { id: 'org-mj-1', name: 'Creative Entrepreneurs Network', aliases: [], type: 'friend_group', description: 'Founders and creatives building outside of corporate paths', status: 'active', member_count: 9, usage_count: 14, confidence: 0.88, last_seen: new Date(Date.now() - 14*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Organizer', members: [{ id: '1', character_name: 'Marcus Johnson', role: 'Organizer', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }] },
        { id: 'org-mj-2', name: 'Executive Coaching Association', aliases: [], type: 'affiliation', description: 'Professional body for certified executive coaches', status: 'active', member_count: 220, usage_count: 2, confidence: 0.93, last_seen: new Date(Date.now() - 45*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Certified Member', members: [{ id: '1', character_name: 'Marcus Johnson', role: 'Certified Member', status: 'active' }] },
        { id: 'org-mj-3', name: 'Venture Capital Advisory Board', aliases: [], type: 'affiliation', description: 'Advisory network for early-stage startups', status: 'active', member_count: 18, usage_count: 3, confidence: 0.79, last_seen: new Date(Date.now() - 60*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Advisor', members: [{ id: '1', character_name: 'Marcus Johnson', role: 'Advisor', status: 'active' }] },
      ],
      'Alex Rivera': [
        { id: 'org-ar-1', name: 'Indie Music Collective', aliases: [], type: 'club', description: 'Independent artists collaborating outside the label system', status: 'active', member_count: 14, usage_count: 22, confidence: 0.89, last_seen: new Date(Date.now() - 7*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Producer', members: [{ id: '1', character_name: 'Alex Rivera', role: 'Producer', status: 'active' }, { id: '2', character_name: 'You', role: 'Artist', status: 'active' }] },
        { id: 'org-ar-2', name: 'Audio Engineers Guild', aliases: [], type: 'affiliation', description: 'Professional society for audio engineering practitioners', status: 'active', member_count: 85, usage_count: 4, confidence: 0.91, last_seen: new Date(Date.now() - 30*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Member', members: [{ id: '1', character_name: 'Alex Rivera', role: 'Member', status: 'active' }] },
      ],
      'Alex': [
        { id: 'org-alex-1', name: 'Hiking Enthusiasts Club', aliases: [], type: 'club', description: 'Weekend trail hikes and outdoor adventures', status: 'active', member_count: 22, usage_count: 11, confidence: 0.85, last_seen: new Date(Date.now() - 20*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: 'Alex', role: 'Member', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }] },
        { id: 'org-alex-2', name: 'Environmental Science Society', aliases: [], type: 'affiliation', description: 'Graduate-level research community focused on sustainability', status: 'active', member_count: 38, usage_count: 3, confidence: 0.87, last_seen: new Date(Date.now() - 45*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Researcher', members: [{ id: '1', character_name: 'Alex', role: 'Researcher', status: 'active' }] },
      ],
      'Jordan Kim': [
        { id: 'org-jk-1', name: 'Kim Family Circle', aliases: [], type: 'friend_group', description: 'The family group and extended network', status: 'active', member_count: 8, usage_count: 25, confidence: 0.98, last_seen: new Date(Date.now() - 5*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: 'Jordan Kim', role: 'Member', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }] },
        { id: 'org-jk-2', name: 'University Alumni Association', aliases: [], type: 'affiliation', description: 'Alumni network from their university program', status: 'active', member_count: 120, usage_count: 4, confidence: 0.74, last_seen: new Date(Date.now() - 90*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Alumnus', members: [{ id: '1', character_name: 'Jordan Kim', role: 'Alumnus', status: 'active' }] },
      ],
    };
    // Default orgs for characters not explicitly mapped; apply G1 defaults to all
    const raw: RawMockOrg[] = SHARED[editedCharacter.name] ?? [
      { id: 'org-default-1', name: 'Creative Community', aliases: [], type: 'friend_group', description: 'Shared creative network', status: 'active', member_count: 8, usage_count: 6, confidence: 0.72, last_seen: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: editedCharacter.name, role: 'Member', status: 'active' }] },
    ];
    return raw.map(withG1);
  };

  // Create mock shared memories for display
  const createMockMemories = (characterName: string): MemoryCard[] => {
    const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
    const profiles: Record<string, MemoryCard[]> = {
      'Sarah Chen': [
        { id: 'sm-sc-1', title: 'Told Sarah about leaving tech', content: `Sat with Sarah at Blue Bottle for three hours. Told her I was thinking about leaving software to focus on music and writing. She didn't try to talk me out of it. She just said "what's stopping you?" That question changed something.`, date: d(2280), tags: ['turning point', 'career'], mood: 'nervous', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'The Decision Year' },
        { id: 'sm-sc-2', title: 'Sarah got the PM promotion', content: `Sarah called to tell me she made the transition to PM. I remember how scared she was to make that move a year ago. Now she sounds lighter. We celebrated at our usual spot.`, date: d(1820), tags: ['milestone', 'celebration'], mood: 'proud', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'Parallel Transitions' },
        { id: 'sm-sc-3', title: 'Writing sprint at the coffee shop', content: `First writing session with Sarah since she started the new role. She brought her laptop and we both worked in silence for two hours, then talked about what we were each building. It felt like the old days but better.`, date: d(1240), tags: ['creative', 'writing', 'coffee'], mood: 'focused', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'Creative Renaissance' },
        { id: 'sm-sc-4', title: 'Talked about the breakup', content: `Sarah was the first person I told about things ending with Taylor. She sat with it for a while before saying anything. When she did, she said exactly the right thing.`, date: d(900), tags: ['support', 'vulnerability'], mood: 'sad', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'The Hard Season' },
        { id: 'sm-sc-5', title: 'Introduced to Alex (girlfriend)', content: `Sarah introduced me to her friend Alex at the coffee shop. I wasn't expecting anything — just a quick hi. We talked for three hours. Sarah kept smiling in the background.`, date: d(365), tags: ['introduction', 'new beginnings'], mood: 'curious', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen', 'Alex'], chapterTitle: 'New Connections' },
        { id: 'sm-sc-6', title: 'Late night coffee, talked about the EP', content: `Sarah listened to the first full rough mix of the EP. She had notes, sharp ones. But she started by saying she was proud of me. I needed to hear that.`, date: d(80), tags: ['music', 'creative feedback'], mood: 'grateful', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'First Album' },
      ],
      'Marcus Johnson': [
        { id: 'sm-mj-1', title: 'First meeting at the entrepreneurship event', content: `Marcus spent an hour with me at the event when he didn't have to. He asked about my work, really listened, then told me something I've thought about every week since: "most people protect their dreams by never starting them."`, date: d(1826), tags: ['mentor', 'turning point'], mood: 'inspired', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson'], chapterTitle: 'Finding Direction' },
        { id: 'sm-mj-2', title: 'Marcus introduced me to Alex Rivera', content: `Marcus introduced me to Alex Rivera at the coffee shop, said we should work together. He has a sense for these things. The introduction took five minutes but it changed everything.`, date: d(1460), tags: ['introduction', 'music', 'creative'], mood: 'excited', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson', 'Alex Rivera'], chapterTitle: 'Creative Expansion' },
        { id: 'sm-mj-3', title: 'Coaching session: the fear conversation', content: `Marcus asked me what I was most afraid of. I said failing publicly. He said that was the wrong fear to have — the real one was succeeding and still feeling empty. That reframe was everything.`, date: d(1100), tags: ['coaching', 'growth', 'fear'], mood: 'uncomfortable but needed', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson'], chapterTitle: 'The Inner Work' },
        { id: 'sm-mj-4', title: 'Told Marcus about the EP decision', content: `Told Marcus I was committing to releasing the EP. He didn't celebrate immediately — he asked if I was ready for what comes after it. Good question. The right question.`, date: d(400), tags: ['creative', 'music', 'decision'], mood: 'determined', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson'], chapterTitle: 'First Album' },
      ],
      'Alex': [
        { id: 'sm-alex-1', title: 'First conversation at the coffee shop', content: `Sarah introduced us. We ended up staying two hours past when we planned to leave. She asked me to play one of my songs. I actually did — on my phone, embarrassingly — and she listened like it mattered. It did.`, date: d(365), tags: ['first meeting', 'music', 'connection'], mood: 'surprised', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'New Connection' },
        { id: 'sm-alex-2', title: 'First hike together', content: `Went up the trail behind the reservoir. We barely talked the first hour — just walked. On the way back she said it was her favorite kind of date. I didn't know it was a date. Guess it was.`, date: d(290), tags: ['outdoors', 'connection', 'nature'], mood: 'warm', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'Building Something' },
        { id: 'sm-alex-3', title: 'She listened to the album demos', content: `Played her the raw demos of the EP. She didn't say much. Then she said one of the songs made her think of something she hadn't thought about in years. That's all I needed to hear.`, date: d(180), tags: ['music', 'creative', 'intimacy'], mood: 'vulnerable', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'First Album' },
        { id: 'sm-alex-4', title: 'She stayed over the first time', content: `She brought wildflowers. Said she found them on the trail this morning and thought of me. I realized I\'ve been thinking about her every single day. I think she knows.`, date: d(120), tags: ['relationship', 'milestone'], mood: 'joyful', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'Deepening' },
      ],
      'Jordan Kim': [
        { id: 'sm-jk-1', title: 'Running in the park after the layoff news', content: `Jordan showed up at my door at 7am, said let\'s run. I was still processing the shock. We ran for an hour without talking about it. On the bench afterward Jordan said "you\'ll figure it out." I believed it only because it was Jordan.`, date: d(1100), tags: ['support', 'family', 'hard time'], mood: 'supported', source: 'journal', sourceIcon: '📖', characters: ['Jordan Kim'], chapterTitle: 'The Hard Season' },
        { id: 'sm-jk-2', title: 'Jordan met Alex for the first time', content: `Brought Alex to Jordan\'s place for dinner. Jordan asked all the right questions — not interrogation, just genuine. When we left Alex said "I like them a lot." That meant everything.`, date: d(300), tags: ['family', 'relationship', 'approval'], mood: 'proud', source: 'journal', sourceIcon: '📖', characters: ['Jordan Kim', 'Alex'], chapterTitle: 'Expanding Circles' },
        { id: 'sm-jk-3', title: 'Sunday morning call', content: `Jordan called just to check in — didn\'t need anything, just called. We talked for 45 minutes about nothing in particular. Some conversations you hold onto.`, date: d(60), tags: ['family', 'connection'], mood: 'warm', source: 'journal', sourceIcon: '📖', characters: ['Jordan Kim'], chapterTitle: 'Present' },
      ],
    };
    const specific = profiles[characterName];
    if (specific) return specific;
    // Generic fallback with time-spanning dates
    const d2 = (daysAgo: number) => d(daysAgo);
    return [
      { id: `mm-1-${characterName}`, title: `First real conversation with ${characterName}`, content: `Something about that first conversation stayed with me. ${characterName} had a way of listening that made me want to say more than I usually do.`, date: d2(540), tags: ['connection', 'first meeting'], mood: 'curious', source: 'journal', sourceIcon: '📖', characters: [characterName] },
      { id: `mm-2-${characterName}`, title: `${characterName} showed up when it mattered`, content: `I didn't ask for help. ${characterName} just showed up. That kind of thing is rare and I try not to take it for granted.`, date: d2(360), tags: ['support', 'friendship'], mood: 'grateful', source: 'journal', sourceIcon: '📖', characters: [characterName] },
      { id: `mm-3-${characterName}`, title: `Working on something together`, content: `Spent the afternoon working alongside ${characterName}. Not even on the same project — just in the same space, both building something. Good energy.`, date: d2(180), tags: ['collaboration', 'work'], mood: 'focused', source: 'journal', sourceIcon: '📖', characters: [characterName] },
      { id: `mm-4-${characterName}`, title: `Catching up after a while apart`, content: `Hadn't seen ${characterName} in a few months. Picked up exactly where we left off. Some relationships don't need maintenance — they just hold.`, date: d2(30), tags: ['reconnection', 'friendship'], mood: 'warm', source: 'journal', sourceIcon: '📖', characters: [characterName] },
    ];
  };
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Generate mock relationship and proximity data
  const generateMockRelationshipData = (character: CharacterDetail): Partial<CharacterDetail> => {
    const mockData: Partial<CharacterDetail> = {};
    
    // Generate proximity level based on character properties
    if (!character.proximity_level) {
      const proximityOptions: Array<'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party'> = ['direct', 'indirect', 'distant', 'unmet', 'third_party'];
      // Weight towards 'direct' for characters with relationships or shared memories
      if (character.relationships && character.relationships.length > 0) {
        mockData.proximity_level = 'direct';
      } else if (character.shared_memories && character.shared_memories.length > 0) {
        mockData.proximity_level = 'direct';
      } else {
        // Random selection with weights
        const weights = [0.5, 0.2, 0.15, 0.1, 0.05]; // direct, indirect, distant, unmet, third_party
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < proximityOptions.length; i++) {
          cumulative += weights[i];
          if (rand <= cumulative) {
            mockData.proximity_level = proximityOptions[i];
            break;
          }
        }
      }
    }
    
    // Generate relationship depth based on character properties
    if (!character.relationship_depth) {
      const depthOptions: Array<'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only'> = ['close', 'moderate', 'casual', 'acquaintance', 'mentioned_only'];
      // Weight towards 'close' or 'moderate' for characters with many shared memories
      if (character.shared_memories && character.shared_memories.length >= 10) {
        mockData.relationship_depth = 'close';
      } else if (character.shared_memories && character.shared_memories.length >= 5) {
        mockData.relationship_depth = 'moderate';
      } else if (character.shared_memories && character.shared_memories.length > 0) {
        mockData.relationship_depth = 'casual';
      } else {
        // Random selection with weights
        const weights = [0.2, 0.3, 0.25, 0.15, 0.1]; // close, moderate, casual, acquaintance, mentioned_only
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < depthOptions.length; i++) {
          cumulative += weights[i];
          if (rand <= cumulative) {
            mockData.relationship_depth = depthOptions[i];
            break;
          }
        }
      }
    }
    
    // Generate has_met based on proximity
    if (character.has_met === null || character.has_met === undefined) {
      const proximity = mockData.proximity_level || character.proximity_level;
      mockData.has_met = proximity === 'direct' || 
                        proximity === 'indirect' || 
                        proximity === 'distant';
    }
    
    // Generate likelihood_to_meet based on proximity and relationship
    if (!character.likelihood_to_meet) {
      const proximity = mockData.proximity_level || character.proximity_level;
      if (proximity === 'unmet') {
        const likelihoodOptions: Array<'likely' | 'possible' | 'unlikely' | 'never'> = ['likely', 'possible', 'unlikely', 'never'];
        const weights = [0.3, 0.4, 0.2, 0.1];
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < likelihoodOptions.length; i++) {
          cumulative += weights[i];
          if (rand <= cumulative) {
            mockData.likelihood_to_meet = likelihoodOptions[i];
            break;
          }
        }
      } else if (proximity === 'third_party') {
        mockData.likelihood_to_meet = 'unlikely';
      } else {
        mockData.likelihood_to_meet = null; // Already met or know them
      }
    }
    
    // Generate context_of_mention for indirect/third-party characters
    const proximity = mockData.proximity_level || character.proximity_level;
    if (!character.context_of_mention && (proximity === 'indirect' || proximity === 'third_party')) {
      const contexts = [
        `Mentioned by ${character.relationships?.[0]?.character_name || 'a mutual friend'} in conversations about shared activities.`,
        `Discussed in context of ${character.role || 'a group'} that you're both part of.`,
        `Brought up during conversations about ${character.archetype || 'mutual connections'}.`,
        `Referenced in discussions about ${character.tags?.[0] || 'shared interests'}.`
      ];
      mockData.context_of_mention = contexts[Math.floor(Math.random() * contexts.length)];
    }
    
    return mockData;
  };

  useEffect(() => {
    const loadFullDetails = async () => {
      setLoadingDetails(true);
      try {
        const response = await fetchJson<CharacterDetail>(`/api/characters/${character.id}`);

        // In DEMO mode only: fill gaps with synthetic relationship data
        if (isMockDataEnabled) {
          const mockRelationshipData = generateMockRelationshipData(response);
          setEditedCharacter({ ...response, ...mockRelationshipData });
        } else {
          setEditedCharacter(response);
        }
        
        // Load full entry details for shared memories
        if (response.shared_memories && response.shared_memories.length > 0) {
          await loadSharedMemories(response.shared_memories);
        } else {
          // If no shared memories, show mock memories only if toggle is enabled
          if (isMockDataEnabled) {
            const mockMemories = createMockMemories(character.name);
            setSharedMemoryCards(mockMemories);
          } else {
            setSharedMemoryCards([]);
          }
        }
      } catch (error) {
        console.error('Failed to load character details:', error);
        // In DEMO mode only: fill gaps with synthetic relationship data on error
        if (isMockDataEnabled) {
          const mockRelationshipData = generateMockRelationshipData(character as CharacterDetail);
          setEditedCharacter({ ...character, ...mockRelationshipData } as CharacterDetail);
        } else {
          setEditedCharacter(character as CharacterDetail);
        }
        
        // On error, show mock memories only if toggle is enabled
        if (isMockDataEnabled) {
          const mockMemories = createMockMemories(character.name);
          setSharedMemoryCards(mockMemories);
        } else {
          setSharedMemoryCards([]);
        }
      } finally {
        setLoadingDetails(false);
      }
    };
    void loadFullDetails();
  }, [character.id, character.name]);

  // Generate mock attributes for demonstration
  const generateMockAttributes = (characterName: string): Array<{
    attributeType: string;
    attributeValue: string;
    confidence: number;
    isCurrent: boolean;
    evidence?: string;
    startTime?: string;
    endTime?: string;
  }> => {
    type AttrEntry = { attributeType: string; attributeValue: string; confidence: number; isCurrent: boolean; evidence?: string; startTime?: string; endTime?: string };
    // Character-specific attribute profiles — each person has a distinct life
    const profiles: Record<string, AttrEntry[]> = {
      'Sarah Chen': [
        { attributeType: 'occupation',         attributeValue: 'Product Manager',         confidence: 0.92, isCurrent: true,  evidence: 'Mentioned transitioning from engineering to product management at her tech company', startTime: '2022-06-01' },
        { attributeType: 'employment_status',  attributeValue: 'Full-time employed',       confidence: 0.95, isCurrent: true  },
        { attributeType: 'workplace',          attributeValue: 'Mid-size Tech Company',    confidence: 0.80, isCurrent: true,  evidence: 'Works at a mid-size tech company in the city' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Coffee shop regular',      confidence: 0.91, isCurrent: true,  evidence: `Meets you at coffee shops for writing sessions frequently` },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Evening socializer',       confidence: 0.78, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Honest and direct',        confidence: 0.88, isCurrent: true,  evidence: 'Described as someone who says what she thinks, even when it is hard to hear' },
        { attributeType: 'personality_trait',  attributeValue: 'Loyal',                    confidence: 0.93, isCurrent: true,  evidence: 'Has been a consistent presence since college' },
        { attributeType: 'relationship_status',attributeValue: 'In a relationship',        confidence: 0.85, isCurrent: true,  evidence: 'Mentioned her partner in recent conversations', startTime: '2023-01-01' },
        { attributeType: 'living_situation',   attributeValue: 'City apartment',           confidence: 0.76, isCurrent: true  },
      ],
      'Marcus Johnson': [
        { attributeType: 'employment_status',  attributeValue: 'Self-employed',            confidence: 0.95, isCurrent: true  },
        { attributeType: 'occupation',         attributeValue: 'Executive Coach',          confidence: 0.97, isCurrent: true,  evidence: 'Runs his own executive coaching practice — has been doing this for over a decade' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Early riser',              confidence: 0.82, isCurrent: true,  evidence: 'Often references morning routines and starting the day early' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Meditation practitioner',  confidence: 0.78, isCurrent: true,  evidence: 'Frequently mentions mindfulness practices in your conversations' },
        { attributeType: 'personality_trait',  attributeValue: 'Patient and deliberate',   confidence: 0.90, isCurrent: true,  evidence: 'Never rushes advice — always listens fully before responding' },
        { attributeType: 'personality_trait',  attributeValue: 'Wise and experienced',     confidence: 0.94, isCurrent: true  },
        { attributeType: 'relationship_status',attributeValue: 'Married',                  confidence: 0.88, isCurrent: true,  evidence: 'Has mentioned his wife in passing during conversations' },
        { attributeType: 'living_situation',   attributeValue: 'Homeowner',                confidence: 0.72, isCurrent: true  },
      ],
      'Alex Rivera': [
        { attributeType: 'employment_status',  attributeValue: 'Freelance / Independent',  confidence: 0.89, isCurrent: true  },
        { attributeType: 'occupation',         attributeValue: 'Music Producer',           confidence: 0.96, isCurrent: true,  evidence: `Has produced numerous tracks with you in your home studio` },
        { attributeType: 'occupation',         attributeValue: 'Audio Engineer',           confidence: 0.88, isCurrent: true,  evidence: 'Also works as an audio engineer — how you both met through Marcus' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Night studio sessions',    confidence: 0.85, isCurrent: true,  evidence: 'Most of your studio sessions together run late into the night' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Tech-savvy creator',       confidence: 0.80, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Detail-oriented',          confidence: 0.87, isCurrent: true,  evidence: 'Spends hours perfecting a single track element — very meticulous' },
        { attributeType: 'personality_trait',  attributeValue: 'Collaborative',            confidence: 0.91, isCurrent: true,  evidence: 'Described as someone who brings out the best in creative partners' },
        { attributeType: 'relationship_status',attributeValue: 'Single',                   confidence: 0.65, isCurrent: true  },
        { attributeType: 'living_situation',   attributeValue: 'Home studio setup',        confidence: 0.84, isCurrent: true,  evidence: 'Has their own home studio in addition to your sessions together' },
      ],
      'Alex': [
        { attributeType: 'occupation',         attributeValue: 'Environmental Scientist',  confidence: 0.88, isCurrent: true,  evidence: 'Works in environmental research — you have talked about her work on sustainability projects' },
        { attributeType: 'employment_status',  attributeValue: 'Full-time employed',       confidence: 0.91, isCurrent: true  },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Outdoor enthusiast',       confidence: 0.94, isCurrent: true,  evidence: 'Hiking, trail running, and nature trips are a regular part of her life' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Early riser',              confidence: 0.81, isCurrent: true,  evidence: 'Frequently up before dawn for trail runs' },
        { attributeType: 'personality_trait',  attributeValue: 'Grounded and present',     confidence: 0.89, isCurrent: true,  evidence: 'Described as someone who makes you feel calm just by being in the room' },
        { attributeType: 'personality_trait',  attributeValue: 'Adventurous',              confidence: 0.92, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Deeply caring',            confidence: 0.90, isCurrent: true,  evidence: 'Remembers the small details — what you said weeks ago, what you need without being asked' },
        { attributeType: 'relationship_status',attributeValue: 'In a relationship with you', confidence: 0.99, isCurrent: true, startTime: new Date(Date.now() - 180 * 86400000).toISOString() },
        { attributeType: 'living_situation',   attributeValue: 'Own apartment',            confidence: 0.82, isCurrent: true  },
      ],
      'Jordan Kim': [
        { attributeType: 'occupation',         attributeValue: 'Healthcare Professional',  confidence: 0.84, isCurrent: true,  evidence: 'Works in the healthcare sector — exact role not specified but clearly meaningful to them' },
        { attributeType: 'employment_status',  attributeValue: 'Full-time employed',       confidence: 0.90, isCurrent: true  },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Regular runner',           confidence: 0.88, isCurrent: true,  evidence: 'You run together in Golden Gate Park — it is a recurring ritual' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Health-conscious',         confidence: 0.82, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Dependable',               confidence: 0.96, isCurrent: true,  evidence: 'Has been there for every major moment without being asked' },
        { attributeType: 'personality_trait',  attributeValue: 'Empathetic',               confidence: 0.91, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Quietly strong',           confidence: 0.87, isCurrent: true,  evidence: 'Does not make noise about it — just shows up' },
        { attributeType: 'relationship_status',attributeValue: 'In a relationship',        confidence: 0.73, isCurrent: true  },
        { attributeType: 'living_situation',   attributeValue: 'Lives in the city',        confidence: 0.79, isCurrent: true  },
      ],
      'Dr. Amara Wells': [
        { attributeType: 'employment_status',  attributeValue: 'Self-employed',            confidence: 0.92, isCurrent: true  },
        { attributeType: 'occupation',         attributeValue: 'Life & Wellness Coach',    confidence: 0.95, isCurrent: true,  evidence: 'Licensed life coach with a gentle, question-based approach' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Mindfulness-based',        confidence: 0.86, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Empowering',               confidence: 0.91, isCurrent: true,  evidence: 'Creates space for you to find your own answers rather than giving them' },
        { attributeType: 'personality_trait',  attributeValue: 'Calm and steady',          confidence: 0.88, isCurrent: true  },
      ],
      'Dr. James Mitchell': [
        { attributeType: 'employment_status',  attributeValue: 'Private practice',         confidence: 0.94, isCurrent: true  },
        { attributeType: 'occupation',         attributeValue: 'Licensed Therapist',       confidence: 0.97, isCurrent: true,  evidence: 'Your therapist — uses evidence-based approaches, primarily CBT and ACT' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Structured and consistent', confidence: 0.80, isCurrent: true },
        { attributeType: 'personality_trait',  attributeValue: 'Compassionate',            confidence: 0.89, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Non-judgmental',           confidence: 0.93, isCurrent: true,  evidence: 'Has never made you feel judged, even when sharing difficult things' },
      ],
      'Luna Martinez': [
        { attributeType: 'employment_status',  attributeValue: 'Freelance',                confidence: 0.78, isCurrent: true  },
        { attributeType: 'occupation',         attributeValue: 'Travel Blogger',           confidence: 0.82, isCurrent: true,  evidence: 'Documents her adventures online — has a following' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Spontaneous traveler',     confidence: 0.93, isCurrent: true,  evidence: 'Plans trips on 24-hour notice — somehow they always work out' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Adventure-seeker',         confidence: 0.90, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Free-spirited',            confidence: 0.88, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Infectious energy',        confidence: 0.85, isCurrent: true,  evidence: 'Being around Luna makes you want to say yes to things' },
        { attributeType: 'relationship_status',attributeValue: 'Single',                   confidence: 0.70, isCurrent: true  },
      ],
      'Sophia Anderson': [
        { attributeType: 'employment_status',  attributeValue: 'Self-employed',            confidence: 0.88, isCurrent: true  },
        { attributeType: 'occupation',         attributeValue: 'Author & Writing Instructor', confidence: 0.94, isCurrent: true, evidence: 'Has published two novels and teaches writing workshops' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Early morning writer',     confidence: 0.89, isCurrent: true,  evidence: 'Writes for 3 hours every morning before anything else' },
        { attributeType: 'personality_trait',  attributeValue: 'Precise with language',    confidence: 0.87, isCurrent: true,  evidence: 'Her feedback always zeros in on the exact word or sentence that is not working' },
        { attributeType: 'personality_trait',  attributeValue: 'Encouraging but honest',   confidence: 0.83, isCurrent: true  },
      ],
      'Emma Thompson': [
        { attributeType: 'occupation',         attributeValue: 'Fiction Writer',           confidence: 0.79, isCurrent: true,  evidence: 'Working on her first novel — you exchange drafts regularly' },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Cafe writer',              confidence: 0.82, isCurrent: true  },
        { attributeType: 'lifestyle_pattern',  attributeValue: 'Avid reader',              confidence: 0.88, isCurrent: true,  evidence: 'Always has a book recommendation ready' },
        { attributeType: 'personality_trait',  attributeValue: 'Thoughtful listener',      confidence: 0.84, isCurrent: true  },
        { attributeType: 'personality_trait',  attributeValue: 'Quietly creative',         confidence: 0.80, isCurrent: true  },
      ],
    };

    return profiles[characterName] ?? [
      { attributeType: 'personality_trait',  attributeValue: 'Supportive',              confidence: 0.78, isCurrent: true, evidence: `Based on how ${characterName} appears in your journal entries` },
      { attributeType: 'lifestyle_pattern',  attributeValue: 'Social',                  confidence: 0.72, isCurrent: true },
      { attributeType: 'relationship_status',attributeValue: 'Status unknown',          confidence: 0.45, isCurrent: true, evidence: 'Not enough data to determine with confidence' },
    ];
  };

  // Load character attributes
  useEffect(() => {
    const loadAttributes = async () => {
      setLoadingAttributes(true);
      try {
        const response = await fetchJson<{ attributes: CharacterAttribute[] }>(`/api/characters/${character.id}/attributes?currentOnly=true`);
        const realAttributes = response.attributes || [];
        if (realAttributes.length === 0 && isMockDataEnabled) {
          setCharacterAttributes(generateMockAttributes(character.name));
        } else {
          setCharacterAttributes(realAttributes);
        }
      } catch (error) {
        console.error('Failed to load character attributes:', error);
        if (isMockDataEnabled) {
          setCharacterAttributes(generateMockAttributes(character.name));
        } else {
          setCharacterAttributes([]);
        }
      } finally {
        setLoadingAttributes(false);
      }
    };
    void loadAttributes();
  }, [character.id, character.name]);

  // Load insights when Insights tab is active and ensure analytics exist
  useEffect(() => {
    if (activeTab === 'insights') {
      // In DEMO mode only: generate synthetic analytics when none exist
      if (!editedCharacter.analytics && isMockDataEnabled) {
        const mockAnalytics = generateMockAnalytics(editedCharacter);
        setEditedCharacter(prev => ({
          ...prev,
          analytics: mockAnalytics
        }));
      }
      
      if (!insights && !loadingInsights) {
      setLoadingInsights(true);
      // Generate AI insights based on character data
      setTimeout(() => {
          const closenessScore = editedCharacter.analytics?.closeness_score || editedCharacter.metadata?.closeness_score || 0;
        const memoryCount = editedCharacter.shared_memories?.length || 0;
        const relationshipCount = editedCharacter.relationships?.length || 0;
        
        // Generate insights
        const generatedInsights = {
          totalMemories: memoryCount,
          relationships: relationshipCount,
          tags: editedCharacter.tags?.length || 0,
          firstAppearance: editedCharacter.first_appearance,
          status: editedCharacter.status,
          closenessScore: closenessScore,
          // AI-generated insights
          relationshipStrength: closenessScore >= 80 ? 'Very Strong' : closenessScore >= 60 ? 'Strong' : closenessScore >= 40 ? 'Moderate' : 'Developing',
          interactionFrequency: memoryCount >= 20 ? 'Very Frequent' : memoryCount >= 10 ? 'Frequent' : memoryCount >= 5 ? 'Occasional' : 'Rare',
          networkSize: relationshipCount >= 10 ? 'Large Network' : relationshipCount >= 5 ? 'Medium Network' : relationshipCount >= 1 ? 'Small Network' : 'Isolated',
          keyThemes: editedCharacter.tags?.slice(0, 5) || [],
          relationshipType: editedCharacter.metadata?.relationship_type || editedCharacter.archetype || 'Unknown',
          lastInteraction: editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 
            ? editedCharacter.shared_memories[editedCharacter.shared_memories.length - 1].date 
            : null,
          insights: [
            closenessScore >= 80 && `You have a ${closenessScore >= 90 ? 'very close' : 'close'} relationship with ${editedCharacter.name} (${closenessScore}/100)`,
            memoryCount > 0 && `You've shared ${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'} together`,
            relationshipCount > 0 && `${editedCharacter.name} is connected to ${relationshipCount} other ${relationshipCount === 1 ? 'person' : 'people'} in your network`,
            editedCharacter.archetype && `Archetype: ${editedCharacter.archetype} - This suggests ${editedCharacter.archetype === 'mentor' ? 'a guidance and learning relationship' : editedCharacter.archetype === 'friend' ? 'a supportive and social connection' : editedCharacter.archetype === 'family' ? 'a deep familial bond' : 'a meaningful connection'}`,
            editedCharacter.status === 'unmet' && 'This character is mentioned but you haven\'t met them yet',
            editedCharacter.tags && editedCharacter.tags.length > 0 && `Key themes: ${editedCharacter.tags.slice(0, 3).join(', ')}`
          ].filter(Boolean)
        };
        
        setInsights(generatedInsights);
        setLoadingInsights(false);
      }, 800);
      }
    }
  }, [activeTab, insights, loadingInsights, editedCharacter]);

  // ── Load intelligence (dynamics + influence) when Intelligence tab opens ────
  useEffect(() => {
    if (activeTab !== 'intelligence' || dynamicsLoaded) return;
    const name = encodeURIComponent(character.name);

    if (isMockDataEnabled) {
      // Mock dynamics
      const mockDynamicsMap: Record<string, any> = {
        'Sarah Chen':    { person_name: 'Sarah Chen',    metrics: { interaction_frequency: 8.2, average_sentiment: 0.82, positive_ratio: 0.91, conflict_frequency: 0.1, support_frequency: 3.1, last_interaction_days_ago: 7, interaction_consistency: 0.88 }, health: { overall_health: 'excellent', health_score: 91, factors: { sentiment: 94, frequency: 88, consistency: 90, conflict_level: 97, support_level: 85 }, trends: { health_trend: 'improving', sentiment_trend: 'improving', frequency_trend: 'stable' }, strengths: ['Consistent support', 'High mutual trust', 'Deep conversation quality'] }, lifecycle: { current_stage: 'deepening', stage_confidence: 0.93, stage_history: [{ stage: 'forming', start_date: '2018-09-15', duration_days: 90 }, { stage: 'developing', start_date: '2018-12-15', duration_days: 365 }, { stage: 'established', start_date: '2019-12-15', duration_days: 730 }, { stage: 'deepening', start_date: '2021-12-15', duration_days: 900 }] }, common_topics: ['creative work', 'relationships', 'career growth'], total_interactions: 156 },
        'Alex':          { person_name: 'Alex',          metrics: { interaction_frequency: 12.5, average_sentiment: 0.89, positive_ratio: 0.95, conflict_frequency: 0.05, support_frequency: 5.2, last_interaction_days_ago: 2, interaction_consistency: 0.94 }, health: { overall_health: 'excellent', health_score: 96, factors: { sentiment: 97, frequency: 95, consistency: 94, conflict_level: 99, support_level: 96 }, trends: { health_trend: 'improving', sentiment_trend: 'improving', frequency_trend: 'increasing' }, strengths: ['Emotional intimacy', 'Frequent contact', 'Shared growth'] }, lifecycle: { current_stage: 'deepening', stage_confidence: 0.97, stage_history: [{ stage: 'forming', start_date: '2023-06-01', duration_days: 60 }, { stage: 'developing', start_date: '2023-08-01', duration_days: 120 }, { stage: 'deepening', start_date: '2023-12-01', duration_days: 180 }] }, common_topics: ['creativity', 'future', 'nature', 'music'], total_interactions: 210 },
        'Marcus Johnson': { person_name: 'Marcus Johnson', metrics: { interaction_frequency: 4.1, average_sentiment: 0.76, positive_ratio: 0.88, conflict_frequency: 0.05, support_frequency: 2.8, last_interaction_days_ago: 14, interaction_consistency: 0.72 }, health: { overall_health: 'good', health_score: 82, factors: { sentiment: 84, frequency: 72, consistency: 74, conflict_level: 96, support_level: 88 }, trends: { health_trend: 'stable', sentiment_trend: 'stable', frequency_trend: 'stable' }, strengths: ['Trusted guidance', 'Career impact', 'Long-term consistency'] }, lifecycle: { current_stage: 'established', stage_confidence: 0.88, stage_history: [{ stage: 'forming', start_date: '2020-03-10', duration_days: 120 }, { stage: 'developing', start_date: '2020-07-10', duration_days: 365 }, { stage: 'established', start_date: '2021-07-10', duration_days: 1100 }] }, common_topics: ['career', 'creativity', 'self-improvement'], total_interactions: 98 },
        'Jordan Kim':     { person_name: 'Jordan Kim', metrics: { interaction_frequency: 6.8, average_sentiment: 0.85, positive_ratio: 0.93, conflict_frequency: 0.02, support_frequency: 4.1, last_interaction_days_ago: 5, interaction_consistency: 0.85 }, health: { overall_health: 'excellent', health_score: 93, factors: { sentiment: 93, frequency: 86, consistency: 87, conflict_level: 99, support_level: 94 }, trends: { health_trend: 'stable', sentiment_trend: 'stable', frequency_trend: 'stable' }, strengths: ['Unconditional support', 'Lifelong bond', 'Emotional safety'] }, lifecycle: { current_stage: 'established', stage_confidence: 0.98, stage_history: [{ stage: 'forming', start_date: '1995-01-01', duration_days: 3650 }, { stage: 'established', start_date: '2005-01-01', duration_days: 7300 }] }, common_topics: ['family', 'life goals', 'support', 'health'], total_interactions: 312 },
      };
      const mockInfluenceMap: Record<string, any> = {
        'Sarah Chen':    { person: 'Sarah Chen',    emotional_impact: 0.78, behavioral_impact: 0.65, toxicity_score: 0.04, uplift_score: 0.88, net_influence: 0.82, interaction_count: 156 },
        'Alex':          { person: 'Alex',          emotional_impact: 0.91, behavioral_impact: 0.72, toxicity_score: 0.02, uplift_score: 0.94, net_influence: 0.91, interaction_count: 210 },
        'Marcus Johnson': { person: 'Marcus Johnson', emotional_impact: 0.62, behavioral_impact: 0.81, toxicity_score: 0.06, uplift_score: 0.79, net_influence: 0.74, interaction_count: 98 },
        'Jordan Kim':     { person: 'Jordan Kim',    emotional_impact: 0.84, behavioral_impact: 0.55, toxicity_score: 0.01, uplift_score: 0.93, net_influence: 0.88, interaction_count: 312 },
      };
      const mockInsightsMap: Record<string, any[]> = {
        'Sarah Chen':    [{ type: 'positive_influence', message: 'Sarah consistently brings out your creative confidence', confidence: 0.89 }, { type: 'uplifting_person', message: 'Interactions with Sarah correlate with increased journaling output', confidence: 0.82 }],
        'Alex':          [{ type: 'positive_influence', message: 'Alex has been the most stabilizing presence during your creative transition', confidence: 0.95 }, { type: 'uplifting_person', message: 'Your emotional wellbeing scores are consistently higher after time with Alex', confidence: 0.93 }],
        'Marcus Johnson': [{ type: 'positive_influence', message: 'Marcus shaped your decision to pursue creative work full-time', confidence: 0.87 }, { type: 'behavior_shift_detected', message: 'Your risk tolerance for career decisions increased after mentorship sessions', confidence: 0.78 }],
        'Jordan Kim':     [{ type: 'positive_influence', message: 'Jordan provides your most consistent source of unconditional support', confidence: 0.94 }, { type: 'uplifting_person', message: 'Interactions with Jordan correlate with improved emotional regulation', confidence: 0.86 }],
      };
      const dyn = mockDynamicsMap[character.name] ?? null;
      const inf = mockInfluenceMap[character.name] ?? { person: character.name, emotional_impact: 0.5, behavioral_impact: 0.4, toxicity_score: 0.1, uplift_score: 0.6, net_influence: 0.55, interaction_count: 20 };
      const ins = mockInsightsMap[character.name] ?? [{ type: 'influence_score', message: `LoreBook is still building intelligence about your relationship with ${character.name}`, confidence: 0.5 }];
      setDynamics(dyn);
      setInfluenceProfile(inf);
      setInfluenceInsights(ins);
      setDynamicsLoaded(true);
      setInfluenceLoaded(true);
      return;
    }

    setDynamicsLoading(true);
    setInfluenceLoading(true);

    Promise.all([
      fetchJson<any>(`/api/relationship-dynamics/${name}`).catch(() => null),
      fetchJson<{ profiles: any[] }>(`/api/influence/profiles`).catch(() => null),
      fetchJson<{ insights: any[] }>(`/api/influence/insights?person=${name}`).catch(() => null),
    ]).then(([dyn, infProfiles, infInsights]) => {
      if (dyn) setDynamics(dyn);
      if (infProfiles?.profiles) {
        const match = infProfiles.profiles.find((p: any) =>
          p.person?.toLowerCase() === character.name.toLowerCase()
        );
        if (match) setInfluenceProfile(match);
      }
      if (infInsights?.insights) setInfluenceInsights(infInsights.insights);
    }).finally(() => {
      setDynamicsLoading(false);
      setInfluenceLoading(false);
      setDynamicsLoaded(true);
      setInfluenceLoaded(true);
    });
  }, [activeTab, character.name, character.id, dynamicsLoaded, isMockDataEnabled]);

  // ── Load provenance ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (provenanceLoaded || isMockDataEnabled) return;
    if (!character.id || character.id.startsWith('dummy-') || character.id.startsWith('char-')) return;
    fetchJson<any>(`/api/characters/${character.id}/provenance`)
      .then(r => setProvenance(r))
      .catch(() => {})
      .finally(() => setProvenanceLoaded(true));
  }, [character.id, provenanceLoaded, isMockDataEnabled]);

  // ── Load ALL attributes (including historical) ───────────────────────────────
  useEffect(() => {
    if (allAttributesLoaded) return;
    if (isMockDataEnabled) {
      const mockAllAttrsMap: Record<string, any[]> = {
        'Sarah Chen': [
          { attributeType: 'occupation', attributeValue: 'Software Engineer', confidence: 0.92, isCurrent: false, startTime: '2018-09-01', endTime: '2022-06-01' },
          { attributeType: 'occupation', attributeValue: 'Product Manager', confidence: 0.88, isCurrent: true, startTime: '2022-06-01' },
          { attributeType: 'lifestyle_pattern', attributeValue: 'Coffee shop writer', confidence: 0.85, isCurrent: true },
          { attributeType: 'relationship_status', attributeValue: 'Single', confidence: 0.9, isCurrent: false, endTime: '2023-01-01' },
          { attributeType: 'relationship_status', attributeValue: 'In a relationship', confidence: 0.91, isCurrent: true, startTime: '2023-01-01' },
        ],
        'Marcus Johnson': [
          { attributeType: 'occupation', attributeValue: 'Executive Coach', confidence: 0.95, isCurrent: true },
          { attributeType: 'lifestyle_pattern', attributeValue: 'Meditation practitioner', confidence: 0.82, isCurrent: true },
        ],
        'Alex': [
          { attributeType: 'lifestyle_pattern', attributeValue: 'Outdoor enthusiast', confidence: 0.93, isCurrent: true },
          { attributeType: 'personality_trait', attributeValue: 'Emotionally supportive', confidence: 0.91, isCurrent: true },
        ],
      };
      setAllAttributes(mockAllAttrsMap[character.name] ?? characterAttributes);
      setAllAttributesLoaded(true);
      return;
    }
    if (!character.id || character.id.startsWith('dummy-')) return;
    fetchJson<{ attributes: any[] }>(`/api/characters/${character.id}/attributes`)
      .then(r => { if (r.attributes) setAllAttributes(r.attributes); })
      .catch(() => {})
      .finally(() => setAllAttributesLoaded(true));
  }, [character.id, character.name, allAttributesLoaded, isMockDataEnabled, characterAttributes]);

  // Load knowledge claims + character facts when Knowledge tab opens
  useEffect(() => {
    if (activeTab !== 'knowledge' || isMockDataEnabled) return;

    if (!knowledgeLoaded) {
      setKnowledgeLoading(true);
      const encodedName = encodeURIComponent(character.name);
      fetchJson<{ success: boolean; claims: any[] }>(
        `/api/knowledge/character-context/${encodedName}`
      )
        .then(r => { if (r.success) setKnowledgeClaims(r.claims); })
        .catch(() => {})
        .finally(() => { setKnowledgeLoading(false); setKnowledgeLoaded(true); });
    }

    if (!factsLoaded && character.id && !character.id.startsWith('dummy-')) {
      setFactsLoading(true);
      fetchJson<{ success: boolean; facts: any[] }>(
        `/api/characters/${character.id}/facts`
      )
        .then(r => { if (r.success) setCharacterFacts(r.facts); })
        .catch(() => {})
        .finally(() => { setFactsLoading(false); setFactsLoaded(true); });
    }

    if (!scenesLoaded && character.id && !character.id.startsWith('dummy-')) {
      fetchJson<{ success: boolean; candidates: any[] }>(
        `/api/characters/${character.id}/scene-candidates`
      )
        .then(r => { if (r.success) setSceneCandidates(r.candidates); })
        .catch(() => {})
        .finally(() => setScenesLoaded(true));
    }
  }, [activeTab, character.id, character.name, knowledgeLoaded, factsLoaded, scenesLoaded, isMockDataEnabled]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex].key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatLoading]);

  // Fetch real organizations for this character
  useEffect(() => {
    if (orgsLoaded || isMockDataEnabled) return;
    const load = async () => {
      try {
        const params = character.id
          ? `character_id=${encodeURIComponent(character.id)}`
          : `character_name=${encodeURIComponent(character.name)}`;
        const res = await fetchJson<{ success: boolean; organizations: Organization[] }>(
          `/api/organizations/by-character?${params}`
        );
        if (res.success) {
          // Mark each org: user_is_member = true when user_relationship is an active role
          const activeRels = new Set(['founder','leader','member','collaborator','adjacent','alumnus']);
          const withMeta = res.organizations.map(org => {
            const member = org.members?.find(m =>
              m.character_id === character.id ||
              m.character_name.toLowerCase() === character.name.toLowerCase()
            );
            return {
              ...org,
              user_is_member: activeRels.has(org.user_relationship),
              character_role: member?.role,
              character_member_notes: member?.notes,
            };
          });
          setCharacterOrganizations(withMeta);
        }
      } catch {
        // Non-fatal — falls back to mock
      } finally {
        setOrgsLoaded(true);
      }
    };
    void load();
  }, [character.id, character.name, isMockDataEnabled, orgsLoaded]);

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatLoading(true);

    try {
      // Build character context from real analytics only — do NOT fabricate
      const analytics = editedCharacter.analytics ?? null;
      const analyticsContext = analytics ? `
RELATIONSHIP ANALYTICS (calculated from conversations, journal entries, and shared memories):
- Closeness Score: ${analytics.closeness_score}/100 (how close the relationship is)
- Relationship Depth: ${analytics.relationship_depth}/100 (depth of emotional connection)
- Interaction Frequency: ${analytics.interaction_frequency}/100 (how often you interact)
- Recency Score: ${analytics.recency_score}/100 (how recently you interacted)
- Importance Score: ${analytics.importance_score}/100 (overall importance to you)
- Priority Score: ${analytics.priority_score}/100 (urgency/priority level)
- Relevance Score: ${analytics.relevance_score}/100 (current relevance in your life)
- Value Score: ${analytics.value_score}/100 (value they provide to you)
- Their Influence on You: ${analytics.character_influence_on_user}/100
- Your Influence Over Them: ${analytics.user_influence_over_character}/100
- Sentiment Score: ${analytics.sentiment_score} (positive to negative, -100 to +100)
- Trust Score: ${analytics.trust_score}/100
- Support Score: ${analytics.support_score}/100
- Conflict Score: ${analytics.conflict_score}/100
- Engagement Score: ${analytics.engagement_score}/100
- Activity Level: ${analytics.activity_level}/100
- Shared Experiences: ${analytics.shared_experiences} memories/events
- Relationship Duration: ${analytics.relationship_duration_days} days
- Relationship Trend: ${analytics.trend} (deepening/stable/weakening)
${analytics.strengths && analytics.strengths.length > 0 ? `- Strengths: ${analytics.strengths.join(', ')}` : ''}
${analytics.weaknesses && analytics.weaknesses.length > 0 ? `- Weaknesses: ${analytics.weaknesses.join(', ')}` : ''}
${analytics.opportunities && analytics.opportunities.length > 0 ? `- Opportunities: ${analytics.opportunities.join(', ')}` : ''}
${analytics.risks && analytics.risks.length > 0 ? `- Risks: ${analytics.risks.join(', ')}` : ''}

You can explain these analytics to the user when asked. For example:
- "Your closeness score of ${analytics.closeness_score}% indicates ${analytics.closeness_score >= 70 ? 'a very close relationship' : analytics.closeness_score >= 40 ? 'a moderate closeness' : 'a developing relationship'}"
- "The relationship trend is ${analytics.trend}, meaning ${analytics.trend === 'deepening' ? 'your connection is growing stronger over time' : analytics.trend === 'weakening' ? 'your connection may be fading' : 'your relationship is stable'}"
- "With ${analytics.shared_experiences} shared experiences, this relationship has ${analytics.shared_experiences >= 10 ? 'significant depth' : analytics.shared_experiences >= 5 ? 'moderate depth' : 'developing depth'}"
` : '';

      const characterContext = `You are helping the user discuss and update information about a specific character in their personal journal system.

CHARACTER CONTEXT:
- Name: ${editedCharacter.name}
- Aliases: ${editedCharacter.alias?.join(', ') || 'None'}
- Pronouns: ${editedCharacter.pronouns || 'Not specified'}
- Role: ${editedCharacter.role || 'Not specified'}
- Archetype: ${editedCharacter.archetype || 'Not specified'}
- Status: ${editedCharacter.status || 'active'}
- Summary: ${editedCharacter.summary || 'No summary available'}
- Tags: ${editedCharacter.tags?.join(', ') || 'None'}
- Shared Memories: ${editedCharacter.shared_memories?.length || 0}
- Relationships: ${editedCharacter.relationships?.length || 0}
${analyticsContext}
INSTRUCTIONS:
1. Answer questions about this character based on the context above
2. If the user asks about analytics, explain what the scores mean and why they might be at that level
3. If the user shares new information or stories about the character, acknowledge it and offer to update the character profile
4. If the user asks to update something (role, summary, tags, etc.), extract the update and respond naturally
5. Be conversational and helpful
6. When updates are needed, format them as JSON in your response like: {"updates": {"summary": "new summary", "tags": ["tag1", "tag2"]}}
7. Use analytics to provide insights based on the scores provided above

User's message: ${message}`;

      const conversationHistory = [
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const response = await fetchJson<{ answer: string; metadata?: any }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: message,
          conversationHistory,
          entityContext: {
            type: 'CHARACTER',
            id: character.id
          }
        })
      });

      let assistantContent = response.answer || response.metadata?.answer || 'I understand. How can I help you with this character?';
      
      // Try to parse updates from response
      let updates = null;
      try {
        // Look for JSON updates in the response
        const jsonMatch = assistantContent.match(/\{[\s\S]*"updates"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          updates = parsed.updates;
          assistantContent = assistantContent.replace(jsonMatch[0], '').trim();
        }
        
        // Also check metadata for updates
        if (response.metadata?.characterUpdates) {
          updates = response.metadata.characterUpdates;
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }

      const assistantMessage = { 
        role: 'assistant' as const, 
        content: assistantContent, 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      // If updates are provided, apply them
      if (updates) {
        try {
          // Update local state immediately for better UX
          setEditedCharacter(prev => ({
            ...prev,
            ...updates,
            tags: updates.tags || prev.tags,
            alias: updates.alias || prev.alias,
            social_media: updates.social_media || prev.social_media
          }));

          // Save to backend
          await fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
          });
          
          const successMessage = { 
            role: 'assistant' as const, 
            content: '✓ Character information updated successfully!', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, successMessage]);
          
          // Refresh character data
          onUpdate();
        } catch (updateError) {
          console.error('Update error:', updateError);
          const errorMsg = { 
            role: 'assistant' as const, 
            content: 'I understood the update, but there was an error saving. Please try again or use the Save button.', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, errorMsg]);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = { 
        role: 'assistant' as const, 
        content: 'Sorry, I encountered an error. Please try again.', 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadSharedMemories = async (sharedMemories: Array<{ id: string; entry_id: string; date: string; summary?: string }>) => {
    setLoadingMemories(true);
    try {
      // Fetch full entry details for each shared memory
      const entryPromises = sharedMemories.map(async (memory) => {
        try {
          const entry = await fetchJson<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }>(`/api/entries/${memory.entry_id}`);
          return memoryEntryToCard(entry);
        } catch (error) {
          console.error(`Failed to load entry ${memory.entry_id}:`, error);
          return null;
        }
      });

      const cards = (await Promise.all(entryPromises)).filter((card): card is MemoryCard => card !== null);
      setSharedMemoryCards(cards);
    } catch (error) {
      console.error('Failed to load shared memories:', error);
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetchJson(`/api/characters/${character.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editedCharacter.name,
          firstName: editedCharacter.first_name,
          lastName: editedCharacter.last_name,
          alias: editedCharacter.alias,
          pronouns: editedCharacter.pronouns,
          archetype: editedCharacter.archetype,
          role: editedCharacter.role,
          status: editedCharacter.status,
          summary: editedCharacter.summary,
          tags: editedCharacter.tags,
          isNickname: editedCharacter.is_nickname,
          proximity: editedCharacter.proximity_level,
          hasMet: editedCharacter.has_met,
          relationshipDepth: editedCharacter.relationship_depth,
          likelihoodToMeet: editedCharacter.likelihood_to_meet,
          social_media: editedCharacter.social_media,
          metadata: editedCharacter.metadata
        })
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to update character:', error);
      alert('Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const updateSocialMedia = (field: keyof SocialMedia, value: string) => {
    setEditedCharacter((prev) => ({
      ...prev,
      social_media: {
        ...prev.social_media,
        [field]: value
      }
    }));
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !editedCharacter.tags?.includes(tag.trim())) {
      setEditedCharacter((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tag.trim()]
      }));
    }
  };

  const removeTag = (tag: string) => {
    setEditedCharacter((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tag) || []
    }));
  };

  const currentAttributes = characterAttributes.filter(attr => attr.isCurrent !== false);
  const attributesByType = (types: string[]) => currentAttributes.filter(attr => types.includes(attr.attributeType));
  const firstAttributeValue = (types: string[]) => attributesByType(types)[0]?.attributeValue;
  const confidenceLabel = (confidence?: number) => confidence == null ? null : `${Math.round(confidence * 100)}% confidence`;
  const prettyAttributeType = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const firstName = editedCharacter.first_name || editedCharacter.name.split(' ')[0] || editedCharacter.name;
  const isRomanticRelationshipType = (type = '') => /\b(romantic|dating|date|boyfriend|girlfriend|partner|spouse|wife|husband|fianc|lover|crush|situationship|ex)\b/i.test(type);
  const romanticConnections = (editedCharacter.relationships ?? [])
    .filter(rel => rel.character_name && rel.character_name !== 'You' && isRomanticRelationshipType(rel.relationship_type));
  const relationshipStatus = firstAttributeValue(['relationship_status']) ??
    (romanticConnections.length > 0 ? romanticConnections[0].relationship_type.replace(/_/g, ' ') : undefined);
  const workAttributes = attributesByType(['employment_status', 'occupation', 'workplace', 'company', 'industry', 'job', 'side_hustle', 'brand', 'business', 'skill', 'certification', 'education']);
  const occupations = attributesByType(['occupation', 'job']).map(attr => attr.attributeValue);
  const workplaces = attributesByType(['workplace', 'company']).map(attr => attr.attributeValue);
  const sideHustles = attributesByType(['side_hustle', 'brand', 'business']).map(attr => attr.attributeValue);
  const companyOrganizations = (isMockDataEnabled ? getMockOrganizations() : characterOrganizations)
    .filter(org => ['company', 'brand', 'business', 'affiliation'].includes(String(org.group_type ?? org.type ?? '').toLowerCase()));
  const lifeMap = [
    { label: 'Location', value: firstAttributeValue(['location', 'living_situation', 'hometown']), prompt: `Where ${editedCharacter.name} lives or is from: ` },
    { label: 'Culture', value: firstAttributeValue(['nationality', 'cultural_background', 'ethnicity']), prompt: `${editedCharacter.name}'s cultural background: ` },
    { label: 'Education', value: firstAttributeValue(['education', 'school', 'degree', 'certification']), prompt: `${editedCharacter.name}'s education or certifications: ` },
    { label: 'Values', value: firstAttributeValue(['core_value', 'values', 'motivation']), prompt: `What ${editedCharacter.name} cares about: ` },
    { label: 'Goals', value: firstAttributeValue(['goal', 'career_goal', 'personal_goal', 'dream']), prompt: `${editedCharacter.name}'s goals: ` },
    { label: 'Interests', value: firstAttributeValue(['interest', 'hobby', 'music', 'sport', 'favorite_activity']), prompt: `${editedCharacter.name}'s interests and hobbies: ` },
  ];
  const behaviorAttributes = attributesByType(['personality_trait', 'communication_style', 'temperament', 'lifestyle_pattern', 'habit', 'decision_style', 'stress_response']);
  const socialStanding = (editedCharacter.metadata as any)?.social_standing as { tier?: string; score?: number; connector?: boolean } | undefined;

  const openCharacterByRelationship = async (rel: Relationship) => {
    try {
      if (rel.character_id) {
        const related = await fetchJson<Character>(`/api/characters/${rel.character_id}`);
        setSelectedCharacterForModal(related);
        return;
      }
    } catch {
      // Fall through to minimal modal seed.
    }
    setSelectedCharacterForModal({
      id: rel.character_id || `temp-${rel.character_name}`,
      name: rel.character_name || 'Unknown',
    } as Character);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm" data-testid="character-modal" role="dialog" aria-modal="true">
      <div className="bg-gradient-to-br from-black via-black/95 to-black border-0 sm:border-2 border-primary/30 rounded-none sm:rounded-2xl w-full h-full sm:h-[95vh] sm:max-w-5xl overflow-hidden flex flex-col shadow-2xl shadow-primary/20">
        {/* Enhanced Header */}
        <div className="relative bg-gradient-to-r from-primary/20 via-purple-900/20 to-primary/20 border-b-2 border-primary/30 p-3 sm:p-6">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                {/* Phase ring around avatar */}
                {(() => {
                  const c = editedCharacter.analytics?.closeness_score ?? 0;
                  const r = editedCharacter.analytics?.recency_score ?? 0;
                  const ringColor =
                    c >= 70 && r >= 0.6 ? 'ring-purple-500/70 shadow-[0_0_10px_rgba(168,85,247,0.6)]' :
                    c >= 45 || r >= 0.4  ? 'ring-cyan-500/60' :
                    c >= 20 || r >= 0.2  ? 'ring-amber-500/50' :
                    'ring-white/10';
                  return (
                    <div className={`ring-2 ${ringColor} rounded-full`}>
                      <CharacterAvatar
                        url={editedCharacter.avatar_url}
                        name={editedCharacter.name}
                        size={48}
                        className="sm:w-16 sm:h-16"
                      />
                    </div>
                  );
                })()}
                {editedCharacter.status && (
                  <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1">
                    <Tooltip content={getStatusTooltip(editedCharacter.status)}>
                    <Badge
                      className={`${
                        editedCharacter.status === 'active'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : editedCharacter.status === 'unmet'
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 border-dashed'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                        } text-[9px] sm:text-xs px-1 sm:px-2 py-0 sm:py-0.5 cursor-help`}
                    >
                      {editedCharacter.status === 'unmet' ? 'Unmet' : editedCharacter.status}
                    </Badge>
                    </Tooltip>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                  <h2 className="text-lg sm:text-2xl md:text-3xl font-bold text-white tracking-tight break-words">
                    {editedCharacter.first_name && editedCharacter.last_name
                      ? `${editedCharacter.first_name} ${editedCharacter.last_name}`
                      : editedCharacter.name}
                  </h2>
                  {editedCharacter.is_nickname && (
                    <Tooltip content={getNicknameTooltip()}>
                    <Badge 
                      variant="outline" 
                        className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[9px] sm:text-xs px-1 sm:px-2 py-0 sm:py-0.5 cursor-help"
                    >
                      <span className="hidden sm:inline">Nickname</span>
                      <span className="sm:hidden">N</span>
                    </Badge>
                    </Tooltip>
                  )}
                </div>
                {/* Compact info row on mobile */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                  {editedCharacter.role && (
                    <Tooltip content={getRoleTooltip(editedCharacter.role)}>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[9px] sm:text-sm px-1.5 sm:px-3 py-0.5 sm:py-1 cursor-help flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="truncate max-w-[80px] sm:max-w-none">{editedCharacter.role}</span>
                      </Badge>
                    </Tooltip>
                  )}
                  {editedCharacter.pronouns && (
                    <Tooltip content={getPronounsTooltip(editedCharacter.pronouns)}>
                      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px] sm:text-sm px-1.5 sm:px-3 py-0.5 sm:py-1 cursor-help flex items-center gap-1">
                        <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {editedCharacter.pronouns}
                      </Badge>
                    </Tooltip>
                  )}
                  {editedCharacter.importance_level && (
                    <Tooltip content={getImportanceTooltip(editedCharacter.importance_level, editedCharacter.importance_score, editedCharacter.analytics?.character_influence_on_user)}>
                    <Badge 
                      variant="outline" 
                        className={`${getImportanceColor(editedCharacter.importance_level)} text-[9px] sm:text-sm px-1.5 sm:px-3 py-0.5 sm:py-1 flex items-center gap-1 cursor-help`}
                    >
                      {getImportanceIcon(editedCharacter.importance_level)}
                      <span className="hidden sm:inline">{getImportanceLabel(editedCharacter.importance_level)}</span>
                      {editedCharacter.importance_score !== null && editedCharacter.importance_score !== undefined && (
                        <span className="text-[8px] sm:text-xs opacity-70 hidden sm:inline">({Math.round(editedCharacter.importance_score)})</span>
                      )}
                    </Badge>
                    </Tooltip>
                  )}
                  {/* Rare in story but high impact on you */}
                  {((editedCharacter.importance_level === 'minor' || editedCharacter.importance_level === 'background') &&
                    (editedCharacter.analytics?.character_influence_on_user ?? 0) >= 70) && (
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[9px] sm:text-sm px-1.5 sm:px-3 py-0.5 sm:py-1 flex items-center gap-1" title="Rare in your story, but high impact on you">
                      <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="hidden sm:inline">Rare in story, high impact on you</span>
                      <span className="sm:hidden">High impact</span>
                    </Badge>
                  )}
                </div>
                {editedCharacter.first_name && editedCharacter.last_name && editedCharacter.name !== `${editedCharacter.first_name} ${editedCharacter.last_name}` && (
                  <p className="text-[10px] sm:text-sm text-white/60 mb-0.5 sm:mb-1 truncate">
                    Display: {editedCharacter.name}
                  </p>
                )}
                {editedCharacter.alias && editedCharacter.alias.length > 0 && (
                  <p className="text-[10px] sm:text-base text-white/70 mb-1 sm:mb-2 truncate">
                    <span className="text-white/50 hidden sm:inline">Also known as: </span>
                    <span className="text-white/50 sm:hidden">AKA: </span>
                    {editedCharacter.alias.join(', ')}
                  </p>
                )}
                {/* Archetype badge - show separately on mobile */}
                {editedCharacter.archetype && (
                  <div className="mt-1 sm:mt-0">
                    <Tooltip content={getArchetypeTooltip(editedCharacter.archetype)}>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px] sm:text-sm px-1.5 sm:px-3 py-0.5 sm:py-1 cursor-help flex items-center gap-1 w-fit">
                        <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="truncate max-w-[100px] sm:max-w-none">{editedCharacter.archetype}</span>
                      </Badge>
                    </Tooltip>
                  </div>
                )}

                {/* ── Intelligence quick-stats bar ── */}
                {(dynamics || editedCharacter.analytics) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-white/8">
                    {/* Health score */}
                    {dynamics?.health?.health_score != null && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              dynamics.health.health_score >= 80 ? 'bg-emerald-400' :
                              dynamics.health.health_score >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${dynamics.health.health_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/45">
                          {dynamics.health.health_score} health
                        </span>
                      </div>
                    )}
                    {/* Trend */}
                    {dynamics?.health?.trends?.health_trend && (
                      <span className={`text-[10px] ${
                        dynamics.health.trends.health_trend === 'improving' ? 'text-emerald-400' :
                        dynamics.health.trends.health_trend === 'declining' ? 'text-red-400' : 'text-white/40'
                      }`}>
                        {dynamics.health.trends.health_trend === 'improving' ? '↑' :
                         dynamics.health.trends.health_trend === 'declining' ? '↓' : '→'}
                        {' '}{dynamics.health.trends.health_trend}
                      </span>
                    )}
                    {/* Stage */}
                    {dynamics?.lifecycle?.current_stage && (
                      <span className="text-[10px] text-white/35 capitalize">
                        {dynamics.lifecycle.current_stage}
                      </span>
                    )}
                    {/* Memory count */}
                    {(editedCharacter.memory_count ?? 0) > 0 && (
                      <span className="text-[10px] text-white/35">
                        {editedCharacter.memory_count} memories
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex-shrink-0 hover:bg-red-500/15 text-white/40 hover:text-red-400 h-8 w-8 sm:h-10 sm:w-10 p-0"
              aria-label="Delete character"
              title="Delete character"
            >
              <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Button variant="ghost" onClick={onClose} className="flex-shrink-0 hover:bg-white/10 h-8 w-8 sm:h-10 sm:w-10 p-0" aria-label="Close">
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div className="flex flex-wrap border-b border-border/60 flex-shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-b-2 border-primary text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div ref={contentRef} className="flex-1 overflow-y-auto p-8 space-y-8 bg-black/40 min-h-0 pb-32">
            {loadingDetails && (
              <div className="text-center py-12 text-white/60">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-lg">Loading character details...</p>
              </div>
            )}
            {!loadingDetails && activeTab === 'info' && (
              <div className="space-y-8">
                {/* About the Character - First so users see the narrative first */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/20 border border-primary/40">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">About the Character</h2>
                      <p className="text-sm text-white/60 mt-0.5">What you&apos;ve said about them</p>
                    </div>
                  </div>
                  <Card className="bg-gradient-to-br from-black/80 via-black/60 to-black/80 border-2 border-primary/30 shadow-xl">
                    <CardContent className="p-6">
                      <div className="text-white text-lg leading-relaxed min-h-[120px]">
                        {editedCharacter.summary ? (
                          <p className="whitespace-pre-wrap">{editedCharacter.summary}</p>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-white/50 italic text-base">
                              Lorebook doesn&apos;t know {editedCharacter.name}&apos;s story yet.
                            </p>
                            <UnknownField
                              label="Their story"
                              prompt={`Let me tell you about ${editedCharacter.name}: `}
                              onAskInChat={askInChat}
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Profile Intelligence — identity, work, relationships, behavior */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40">
                      <Brain className="h-5 w-5 text-cyan-300" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Profile Intelligence</h2>
                      <p className="text-sm text-white/60 mt-0.5">
                        The living character sheet LoreBook builds from conversations, facts, and relationships.
                      </p>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-4">
                    <Card className="bg-gradient-to-br from-rose-950/25 via-black/50 to-black/70 border border-rose-500/25">
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Heart className="h-4 w-4 text-rose-300" />
                          Relationship Status
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {relationshipStatus ? (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-white/35 mb-1">Current status</p>
                            <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/30 px-3 py-1 capitalize">
                              {relationshipStatus}
                            </Badge>
                          </div>
                        ) : (
                          <UnknownField
                            label="Relationship status"
                            prompt={`${editedCharacter.name}'s relationship status is `}
                            onAskInChat={askInChat}
                          />
                        )}

                        {romanticConnections.length > 0 ? (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-white/35 mb-2">Romantic links</p>
                            <div className="space-y-2">
                              {romanticConnections.map(rel => (
                                <button
                                  key={rel.id ?? rel.character_id}
                                  type="button"
                                  onClick={() => void openCharacterByRelationship(rel)}
                                  className="w-full rounded-lg border border-rose-500/20 bg-black/35 px-3 py-2 text-left hover:border-rose-400/50 hover:bg-rose-500/10 transition-colors"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-white">{rel.character_name}</span>
                                    <span className="text-[10px] uppercase tracking-wide text-rose-300">{rel.relationship_type.replace(/_/g, ' ')}</span>
                                  </div>
                                  {rel.summary && <p className="text-xs text-white/45 mt-1 line-clamp-2">{rel.summary}</p>}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-white/35">
                            No partner, dating, spouse, or crush connection is linked yet. When learned, the person appears here as a clickable card.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-950/25 via-black/50 to-black/70 border border-amber-500/25">
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-amber-300" />
                          Work, Brands & Occupations
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {workAttributes.length > 0 || companyOrganizations.length > 0 ? (
                          <>
                            {occupations.length > 0 && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-white/35 mb-1">What they do</p>
                                <div className="flex flex-wrap gap-2">
                                  {occupations.map(value => (
                                    <Badge key={value} variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">{value}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(workplaces.length > 0 || companyOrganizations.length > 0) && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-white/35 mb-1">Where / companies</p>
                                <div className="flex flex-wrap gap-2">
                                  {workplaces.map(value => (
                                    <Badge key={value} variant="outline" className="bg-orange-500/15 text-orange-300 border-orange-500/30">{value}</Badge>
                                  ))}
                                  {companyOrganizations.map(org => (
                                    <button
                                      key={org.id}
                                      type="button"
                                      onClick={() => setSelectedOrganization(org)}
                                      className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-200 hover:bg-orange-500/20 transition-colors"
                                    >
                                      {org.name}{org.character_role ? ` — ${org.character_role}` : ''}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sideHustles.length > 0 && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-white/35 mb-1">Side hustles / brands</p>
                                <div className="flex flex-wrap gap-2">
                                  {sideHustles.map(value => (
                                    <Badge key={value} variant="outline" className="bg-yellow-500/15 text-yellow-200 border-yellow-500/30">{value}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {workAttributes.slice(0, 3).map(attr => attr.evidence && (
                              <p key={`${attr.attributeType}-${attr.attributeValue}`} className="text-[11px] text-white/35 italic line-clamp-2">
                                {attr.evidence}
                              </p>
                            ))}
                          </>
                        ) : (
                          <UnknownField
                            label="Work"
                            prompt={`What ${editedCharacter.name} does for work, brands, side hustles, or occupations: `}
                            onAskInChat={askInChat}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-4">
                    <Card className="bg-black/45 border border-white/10">
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <UserCircle className="h-4 w-4 text-cyan-300" />
                          Identity & Life
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {lifeMap.map(item => (
                          <div key={item.label} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] border border-white/8 px-3 py-2">
                            <span className="text-xs text-white/35">{item.label}</span>
                            {item.value ? (
                              <span className="text-xs text-white/80 text-right">{item.value}</span>
                            ) : (
                              <button type="button" onClick={() => askInChat(item.prompt)} className="text-xs text-primary hover:text-primary/80">Add</button>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="bg-black/45 border border-white/10">
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Smile className="h-4 w-4 text-violet-300" />
                          Personality & Patterns
                        </h3>
                      </CardHeader>
                      <CardContent>
                        {behaviorAttributes.length > 0 ? (
                          <div className="space-y-2">
                            {behaviorAttributes.slice(0, 8).map(attr => (
                              <div key={`${attr.attributeType}-${attr.attributeValue}`} className="rounded-lg border border-violet-500/15 bg-violet-500/5 px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-sm text-white/85">{attr.attributeValue}</span>
                                  <span className="text-[10px] text-violet-300/70">{prettyAttributeType(attr.attributeType)}</span>
                                </div>
                                {attr.evidence && <p className="text-[10px] text-white/35 mt-1 line-clamp-2">{attr.evidence}</p>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <UnknownField
                            label="Personality"
                            prompt={`How ${editedCharacter.name} behaves, communicates, and reacts under stress: `}
                            onAskInChat={askInChat}
                          />
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-black/45 border border-white/10">
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Network className="h-4 w-4 text-emerald-300" />
                          Social Standing
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-lg bg-white/[0.03] border border-white/8 px-3 py-2">
                          <p className="text-xs text-white/35 mb-1">Role in your network</p>
                          <p className="text-sm text-white/85 capitalize">
                            {socialStanding?.tier?.replace(/_/g, ' ') ?? editedCharacter.importance_level ?? 'Still learning'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-white/[0.03] border border-white/8 px-3 py-2">
                          <p className="text-xs text-white/35 mb-1">Connections</p>
                          <p className="text-sm text-white/85">{editedCharacter.relationship_count ?? editedCharacter.relationships?.length ?? 0} known links</p>
                        </div>
                        <p className="text-[11px] text-white/35 leading-relaxed">
                          Calculated from mentions, relationship links, organizations, influence, reputation signals, and how often they shape your story.
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-gradient-to-br from-cyan-950/20 via-black/45 to-violet-950/20 border border-cyan-500/20">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <Lightbulb className="h-4 w-4 text-cyan-300" />
                        How LoreBook will build this profile
                      </h3>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-white/55">
                        {[
                          'Who they are: names, aliases, pronouns, location, culture',
                          'Who matters to them: partners, family, friends, coworkers',
                          'What they do: jobs, industries, companies, brands, side hustles',
                          'What they care about: values, interests, goals, preferences',
                          'What happened: life events, accomplishments, failures, history',
                          'How they behave: personality, communication, habits, stress patterns',
                          'How they are seen: reputation, influence, community role',
                          'How they change: timeline, old attributes, current state',
                        ].map(item => (
                          <div key={item} className="rounded-lg border border-white/8 bg-white/[0.03] p-2 leading-snug">{item}</div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Relationship Section */}
                {relationship && (
                  <Card className="bg-gradient-to-br from-pink-950/20 via-purple-950/20 to-pink-950/20 border-2 border-pink-500/30 shadow-xl">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-pink-500/20 border border-pink-500/40">
                          <Heart className="h-6 w-6 text-pink-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Relationship Status</h2>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={`text-sm px-3 py-1 ${
                              relationship.status === 'active' 
                                ? 'bg-green-500/20 text-green-300 border-green-500/30' 
                                : relationship.status === 'ended'
                                ? 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                                : relationship.status === 'on_break'
                                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                                : 'bg-white/10 text-white/70 border-white/20'
                            }`}
                          >
                            <Heart 
                              className="w-4 h-4 mr-1" 
                              style={{
                                fill: relationship.is_current && relationship.status === 'active' 
                                  ? `rgba(244, 114, 182, ${relationship.affection_score})` 
                                  : 'transparent',
                                stroke: 'currentColor',
                                strokeWidth: 2
                              }}
                            />
                            {relationship.relationship_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                          {relationship.is_situationship && (
                            <Badge variant="outline" className="text-sm px-3 py-1 bg-purple-500/20 text-purple-300 border-purple-500/30">
                              Situationship
                            </Badge>
                          )}
                          {relationship.exclusivity_status && (
                            <Badge variant="outline" className="text-sm px-3 py-1 bg-blue-500/20 text-blue-300 border-blue-500/30">
                              {relationship.exclusivity_status}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/40 rounded-lg p-4 border border-pink-500/20">
                            <p className="text-xs text-white/60 mb-1">Compatibility</p>
                            <div className="flex items-center gap-2">
                              <p className={`text-lg font-semibold ${
                                relationship.compatibility_score >= 0.7 ? 'text-green-400' :
                                relationship.compatibility_score >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {Math.round(relationship.compatibility_score * 100)}%
                              </p>
                              {relationship.compatibility_score >= 0.7 ? (
                                <TrendingUp className="w-4 h-4 text-green-400" />
                              ) : relationship.compatibility_score < 0.4 ? (
                                <TrendingDown className="w-4 h-4 text-red-400" />
                              ) : null}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-pink-500/20">
                            <p className="text-xs text-white/60 mb-1">Relationship Health</p>
                            <div className="flex items-center gap-2">
                              <p className={`text-lg font-semibold ${
                                relationship.relationship_health >= 0.7 ? 'text-green-400' :
                                relationship.relationship_health >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {Math.round(relationship.relationship_health * 100)}%
                              </p>
                              {relationship.relationship_health >= 0.7 ? (
                                <TrendingUp className="w-4 h-4 text-green-400" />
                              ) : relationship.relationship_health < 0.4 ? (
                                <TrendingDown className="w-4 h-4 text-red-400" />
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Interest Levels */}
                        {(() => {
                          const compat = relationship.compatibility_score ?? 0.5;
                          const health = relationship.relationship_health ?? 0.5;
                          const intensity = relationship.emotional_intensity ?? 0.5;
                          let theirInterest = (compat * 0.4) + (health * 0.4) + (intensity * 0.2);
                          if (!relationship.is_current || relationship.status === 'ended') theirInterest *= 0.7;
                          theirInterest = Math.min(1.0, Math.max(0.0, theirInterest));
                          const getInterestColor = (score: number) => {
                            if (score >= 0.7) return 'text-green-400';
                            if (score >= 0.4) return 'text-yellow-400';
                            return 'text-red-400';
                          };
                          return (
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              <div className="bg-black/40 rounded-lg p-4 border border-pink-500/20">
                                <p className="text-xs text-white/60 mb-1 flex items-center gap-1">
                                  <Heart className="w-3 h-3" />
                                  Your Interest
                                </p>
                                <p className={`text-lg font-semibold ${getInterestColor(relationship.affection_score)}`}>
                                  {Math.round(relationship.affection_score * 100)}%
                                </p>
                              </div>
                              <div className="bg-black/40 rounded-lg p-4 border border-pink-500/20">
                                <p className="text-xs text-white/60 mb-1 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  Their Interest
                                </p>
                                <p className={`text-lg font-semibold ${getInterestColor(theirInterest)}`}>
                                  {Math.round(theirInterest * 100)}%
                                </p>
                              </div>
                            </div>
                          );
                        })()}

                        {relationship.start_date && (
                          <div className="text-sm text-white/70">
                            <span className="text-white/50">Started: </span>
                            {new Date(relationship.start_date).toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </div>
                        )}

                        {(relationship.pros.length > 0 || relationship.cons.length > 0) && (
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            {relationship.pros.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-green-400 mb-2">Pros ({relationship.pros.length})</p>
                                <ul className="space-y-1">
                                  {relationship.pros.slice(0, 3).map((pro, idx) => (
                                    <li key={idx} className="text-xs text-white/70 flex items-start gap-2">
                                      <span className="text-green-400 mt-1">•</span>
                                      <span>{pro}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {relationship.cons.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-red-400 mb-2">Cons ({relationship.cons.length})</p>
                                <ul className="space-y-1">
                                  {relationship.cons.slice(0, 3).map((con, idx) => (
                                    <li key={idx} className="text-xs text-white/70 flex items-start gap-2">
                                      <span className="text-red-400 mt-1">•</span>
                                      <span>{con}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Subtle auto-update note */}
                <p className="text-[11px] text-white/30 flex items-center gap-1.5">
                  <Info className="h-3 w-3 flex-shrink-0" />
                  Attributes are auto-detected from your conversations. Use the Chat tab to update them.
                </p>

                {/* Detected Attributes — clean grouped rows */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white/50 flex items-center gap-1.5 uppercase tracking-widest">
                      <UserCircle className="h-3.5 w-3.5" />
                      Detected Attributes
                    </h3>
                    {characterAttributes.length > 0 && (
                      <span className="text-[10px] text-white/25">{characterAttributes.length} detected</span>
                    )}
                  </div>

                  {loadingAttributes && (
                    <div className="flex items-center gap-2 py-4 text-white/40 text-sm">
                      <Clock className="h-4 w-4 animate-spin" />
                      <span>Loading...</span>
                    </div>
                  )}

                  {!loadingAttributes && characterAttributes.length === 0 && (
                    <p className="text-sm text-white/30 py-3">
                      No attributes detected yet — keep journaling about {editedCharacter.name.split(' ')[0]}.
                    </p>
                  )}

                  {!loadingAttributes && characterAttributes.length > 0 && (
                    <div className="space-y-3">
                      {[
                        {
                          label: 'Work',
                          types: ['employment_status','occupation','workplace','financial_status'],
                          icon: <Briefcase className="h-3.5 w-3.5" />,
                          color: { label: 'text-amber-400', icon: 'text-amber-400', border: 'border-amber-500/25', bg: 'bg-amber-950/20', divider: 'divide-amber-500/10', rowHover: 'hover:bg-amber-500/8', typePill: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
                        },
                        {
                          label: 'Life',
                          types: ['relationship_status','living_situation'],
                          icon: <HeartIcon className="h-3.5 w-3.5" />,
                          color: { label: 'text-rose-400', icon: 'text-rose-400', border: 'border-rose-500/25', bg: 'bg-rose-950/20', divider: 'divide-rose-500/10', rowHover: 'hover:bg-rose-500/8', typePill: 'bg-rose-500/15 text-rose-300 border-rose-500/25' },
                        },
                        {
                          label: 'Lifestyle',
                          types: ['lifestyle_pattern','health_condition'],
                          icon: <Activity className="h-3.5 w-3.5" />,
                          color: { label: 'text-teal-400', icon: 'text-teal-400', border: 'border-teal-500/25', bg: 'bg-teal-950/20', divider: 'divide-teal-500/10', rowHover: 'hover:bg-teal-500/8', typePill: 'bg-teal-500/15 text-teal-300 border-teal-500/25' },
                        },
                        {
                          label: 'Personality',
                          types: ['personality_trait'],
                          icon: <Smile className="h-3.5 w-3.5" />,
                          color: { label: 'text-violet-400', icon: 'text-violet-400', border: 'border-violet-500/25', bg: 'bg-violet-950/20', divider: 'divide-violet-500/10', rowHover: 'hover:bg-violet-500/8', typePill: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
                        },
                      ].concat(
                        (() => {
                          const known = ['employment_status','occupation','workplace','financial_status','relationship_status','living_situation','lifestyle_pattern','health_condition','personality_trait'];
                          const extra = characterAttributes.filter(a => !known.includes(a.attributeType));
                          return extra.length ? [{
                            label: 'Other', types: extra.map(a => a.attributeType), icon: <Tag className="h-3.5 w-3.5" />,
                            color: { label: 'text-sky-400', icon: 'text-sky-400', border: 'border-sky-500/25', bg: 'bg-sky-950/20', divider: 'divide-sky-500/10', rowHover: 'hover:bg-sky-500/8', typePill: 'bg-sky-500/15 text-sky-300 border-sky-500/25' },
                          }] : [];
                        })()
                      )
                      .map(group => {
                        const attrs = characterAttributes.filter(a => group.types.includes(a.attributeType));
                        if (!attrs.length) return null;
                        const c = group.color;
                        const confDot = (v: number) => v >= 0.8 ? 'bg-emerald-400' : v >= 0.6 ? 'bg-yellow-400' : 'bg-orange-400';
                        const TYPE_LABELS: Record<string, string> = { employment_status: 'Status', occupation: 'Role', workplace: 'Where', financial_status: 'Finances', relationship_status: 'Relationship', living_situation: 'Living', lifestyle_pattern: 'Habit', personality_trait: 'Trait', health_condition: 'Health' };
                        return (
                          <div key={group.label}>
                            {/* Colored group header */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className={c.icon}>{group.icon}</span>
                              <span className={`text-[10px] font-semibold uppercase tracking-widest ${c.label}`}>{group.label}</span>
                            </div>
                            {/* Colored card */}
                            <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden divide-y ${c.divider}`}>
                              {attrs.map((attr, idx) => (
                                <div key={idx} className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${c.rowHover}`}>
                                  {/* Colored type pill */}
                                  <span className={`text-[9px] font-semibold border rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0 uppercase tracking-wider ${c.typePill}`}>
                                    {TYPE_LABELS[attr.attributeType] ?? attr.attributeType.replace(/_/g, ' ')}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white/90 font-medium leading-snug">{attr.attributeValue}</p>
                                    {attr.evidence && (
                                      <p className="text-[10px] text-white/40 mt-0.5 leading-snug line-clamp-2 italic">
                                        {attr.evidence.length > 100 ? attr.evidence.substring(0, 100) + '…' : attr.evidence}
                                      </p>
                                    )}
                                  </div>
                                  <Tooltip content={`${Math.round(attr.confidence * 100)}% confidence`}>
                                    <div className={`h-2 w-2 rounded-full mt-2 flex-shrink-0 ${confDot(attr.confidence)}`} />
                                  </Tooltip>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Provenance — origin story ── */}
                {(provenance || isMockDataEnabled) && (() => {
                  const mockProvenanceMap: Record<string, any> = {
                    'Sarah Chen':    { mentionCount: 156, firstMentionedAt: '2018-09-20T00:00:00Z', lastMentionedAt: new Date(Date.now() - 7 * 86400000).toISOString(), sourceUtterances: [{ content: `I had coffee with Sarah today — she was the first person I told about wanting to leave tech for creative work. She just listened, then said "what's stopping you?"`, created_at: '2018-09-20T00:00:00Z' }] },
                    'Marcus Johnson': { mentionCount: 98,  firstMentionedAt: '2020-03-12T00:00:00Z', lastMentionedAt: new Date(Date.now() - 14 * 86400000).toISOString(), sourceUtterances: [{ content: `Met Marcus at that entrepreneurship event. He spent an hour talking to me about creative courage. Something he said stuck: "most people protect their dreams by never starting them."`, created_at: '2020-03-12T00:00:00Z' }] },
                    'Alex':           { mentionCount: 210, firstMentionedAt: '2023-06-03T00:00:00Z', lastMentionedAt: new Date(Date.now() - 2 * 86400000).toISOString(),  sourceUtterances: [{ content: `Sarah introduced me to her friend Alex at the coffee shop today. We ended up talking for three hours. She asked me to play her one of my songs and I actually did.`, created_at: '2023-06-03T00:00:00Z' }] },
                    'Jordan Kim':     { mentionCount: 312, firstMentionedAt: '1995-06-15T00:00:00Z', lastMentionedAt: new Date(Date.now() - 5 * 86400000).toISOString(),   sourceUtterances: [{ content: `Jordan and I ran in the park this morning. We didn't talk much. That's the thing about Jordan — sometimes you don't need to.`, created_at: '2022-03-01T00:00:00Z' }] },
                  };
                  const p = isMockDataEnabled ? mockProvenanceMap[editedCharacter.name] : provenance;
                  if (!p) return null;
                  return (
                    <div className="p-4 rounded-xl border border-white/10 bg-white/4 space-y-3">
                      <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        How LoreBook learned about {editedCharacter.name.split(' ')[0]}
                      </h4>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                        {p.mentionCount > 0 && <span><span className="text-white/75 font-semibold">{p.mentionCount}</span> mentions</span>}
                        {p.firstMentionedAt && <span>First: <span className="text-white/65">{new Date(p.firstMentionedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>}
                        {p.lastMentionedAt && <span>Last: <span className="text-white/65">{new Date(p.lastMentionedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>}
                      </div>
                      {p.sourceUtterances?.[0] && (
                        <blockquote className="pl-3 border-l-2 border-white/15">
                          <p className="text-xs text-white/55 italic leading-relaxed line-clamp-3">
                            "{p.sourceUtterances[0].content}"
                          </p>
                          <p className="text-[10px] text-white/25 mt-1">
                            — {new Date(p.sourceUtterances[0].created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </p>
                        </blockquote>
                      )}
                    </div>
                  );
                })()}

                {/* ── Temporal Attribute History ── */}
                {allAttributes.length > 0 && (() => {
                  const historical = allAttributes.filter(a => !a.isCurrent);
                  const current = allAttributes.filter(a => a.isCurrent);
                  if (historical.length === 0) return null;
                  const grouped: Record<string, any[]> = {};
                  for (const a of [...current, ...historical]) {
                    if (!grouped[a.attributeType]) grouped[a.attributeType] = [];
                    grouped[a.attributeType].push(a);
                  }
                  const typesWithHistory = Object.entries(grouped).filter(([, items]) => items.length > 1);
                  if (typesWithHistory.length === 0) return null;
                  return (
                    <div className="p-4 rounded-xl border border-white/10 bg-white/4 space-y-3">
                      <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Attribute Evolution</h4>
                      <div className="space-y-3">
                        {typesWithHistory.map(([type, items]) => (
                          <div key={type}>
                            <p className="text-[10px] text-white/30 mb-1.5 capitalize">{type.replace(/_/g, ' ')}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {items.sort((a, b) => (a.isCurrent ? 1 : -1) - (b.isCurrent ? 1 : -1)).map((a, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${a.isCurrent ? 'border-primary/30 bg-primary/10 text-primary' : 'border-white/10 bg-white/5 text-white/40 line-through'}`}>
                                    {a.attributeValue}
                                  </span>
                                  {!a.isCurrent && a.endTime && (
                                    <span className="text-[9px] text-white/25">until {new Date(a.endTime).getFullYear()}</span>
                                  )}
                                  {i < items.length - 1 && <span className="text-white/20 text-xs">→</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Name Section */}
                <Card className="bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-2 border-primary/30 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 rounded-lg bg-primary/20 border border-primary/40">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Name Information</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">First Name</label>
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-base min-h-[48px] flex items-center font-medium shadow-inner">
                          {editedCharacter.first_name || <span className="text-white/40 italic">Not specified</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Last Name</label>
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-base min-h-[48px] flex items-center font-medium shadow-inner">
                          {editedCharacter.last_name || <span className="text-white/40 italic">Not specified</span>}
                        </div>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide flex items-center gap-3">
                      Display Name
                      {editedCharacter.is_nickname && (
                          <Tooltip content={getNicknameTooltip()}>
                            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50 text-xs px-2 py-1 font-semibold cursor-help">
                          Nickname
                        </Badge>
                          </Tooltip>
                      )}
                    </label>
                      <div className="bg-gradient-to-r from-primary/20 to-primary/10 border-2 border-primary/40 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-lg">
                        {editedCharacter.name}
                      </div>
                      {editedCharacter.first_name && editedCharacter.last_name && (
                        <p className="text-sm text-white/60 mt-2 font-medium">
                          Full name: <span className="text-white/80">{editedCharacter.first_name} {editedCharacter.last_name}</span>
                        </p>
                      )}
                  </div>

                  <div>
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Aliases / Nicknames</label>
                      {editedCharacter.alias && editedCharacter.alias.length > 0 ? (
                        <div className="flex flex-wrap gap-3">
                          {editedCharacter.alias.map((alias) => (
                            <Tooltip key={alias} content={getAliasTooltip(alias)}>
                              <Badge variant="outline" className="bg-primary/20 text-primary border-primary/40 text-sm px-4 py-2 font-semibold shadow-md cursor-help">
                                {alias}
                              </Badge>
                            </Tooltip>
                          ))}
                  </div>
                      ) : (
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white/50 text-sm min-h-[48px] flex items-center italic">
                          No aliases recorded
                </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Importance Section */}
                {(editedCharacter.importance_level || editedCharacter.importance_score !== null) && (
                  <Card className="bg-gradient-to-br from-purple-500/20 via-purple-600/15 to-purple-500/20 border-2 border-purple-500/40 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/40">
                          <TrendingUp className="h-5 w-5 text-purple-300" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Importance Level</h3>
                    </div>
                    
                      <div className="flex items-center gap-6 mb-4">
                      {editedCharacter.importance_level && (
                        <div className="flex items-center gap-2">
                            <Tooltip content={getImportanceTooltip(editedCharacter.importance_level, editedCharacter.importance_score, editedCharacter.analytics?.character_influence_on_user)}>
                          <Badge 
                            variant="outline" 
                                className={`${getImportanceColor(editedCharacter.importance_level)} text-base px-4 py-2 flex items-center gap-2 font-bold shadow-md cursor-help`}
                          >
                            {getImportanceIcon(editedCharacter.importance_level)}
                            <span>{getImportanceLabel(editedCharacter.importance_level)}</span>
                          </Badge>
                            </Tooltip>
                        </div>
                      )}
                      {editedCharacter.importance_score !== null && editedCharacter.importance_score !== undefined && (
                          <div className="flex items-center gap-3 bg-black/40 rounded-lg px-4 py-2 border border-purple-500/30">
                            <span className="text-sm font-semibold text-white/70 uppercase tracking-wide">Score:</span>
                            <span className="text-2xl font-bold text-purple-300">{Math.round(editedCharacter.importance_score)}/100</span>
                        </div>
                      )}
                    </div>
                      {/* Rare in story but high impact on you */}
                      {((editedCharacter.importance_level === 'minor' || editedCharacter.importance_level === 'background') &&
                        ((typeof (editedCharacter.metadata as any)?.impact_override === 'number'
                          ? (editedCharacter.metadata as any).impact_override
                          : editedCharacter.analytics?.character_influence_on_user) ?? 0) >= 70) && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 px-4 py-3">
                          <Zap className="h-5 w-5 text-purple-400 flex-shrink-0" />
                          <p className="text-sm font-medium text-purple-200">
                            Rare in your story, but high impact on you — they shape your choices and thoughts even with limited presence.
                          </p>
                        </div>
                      )}
                      <div className="bg-black/40 rounded-lg p-3 border border-purple-500/20">
                        <p className="text-sm text-white/80 flex items-start gap-2 leading-relaxed">
                          <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-purple-300" />
                      <span>Importance is automatically calculated based on mentions, relationships, role significance, and interaction frequency. This helps identify major vs. minor characters in your story.</span>
                    </p>
                  </div>
                    </CardContent>
                  </Card>
                )}

                {/* Your Ranking — user overrides for computed standing + impact */}
                {(() => {
                  const meta = (editedCharacter.metadata ?? {}) as Record<string, any>;
                  const standing = meta.social_standing as { tier?: string; score?: number } | undefined;
                  const overrideTier: string | null = meta.standing_override?.tier ?? null;
                  const impactOverride: number | null = typeof meta.impact_override === 'number' ? meta.impact_override : null;
                  const tierLabels: Record<string, string> = {
                    inner_circle: 'Inner circle', close: 'Close', regular: 'Regular',
                    peripheral: 'Peripheral', public_figure: 'Public figure',
                  };
                  const setMeta = (key: string, value: unknown) => {
                    setEditedCharacter((prev) => ({
                      ...prev,
                      metadata: { ...((prev.metadata ?? {}) as Record<string, any>), [key]: value },
                    }));
                  };
                  // Persist right away — the Info tab has no save button; the
                  // server merges metadata and treats null as "clear override".
                  const persistOverride = async (key: string, value: unknown) => {
                    setMeta(key, value);
                    try {
                      await fetchJson(`/api/characters/${character.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ metadata: { [key]: value } }),
                      });
                      onUpdate();
                    } catch (err) {
                      console.error('Failed to save ranking override:', err);
                    }
                  };
                  return (
                    <Card className="bg-gradient-to-br from-emerald-500/20 via-emerald-600/15 to-emerald-500/20 border-2 border-emerald-500/40 shadow-lg">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
                            <Star className="h-5 w-5 text-emerald-300" />
                          </div>
                          <h3 className="text-xl font-bold text-white">Your Ranking</h3>
                        </div>
                        <p className="text-sm text-white/70 mb-5">
                          You know your people better than the math does. Pin where this person stands
                          and how much impact they have on you — your choice always wins over the computed ranking.
                        </p>

                        <div className="grid sm:grid-cols-2 gap-6">
                          <div>
                            <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Standing</label>
                            <select
                              data-testid="standing-override-select"
                              aria-label="Standing tier override"
                              title="Standing tier override"
                              value={overrideTier ?? 'auto'}
                              onChange={(e) => {
                                const v = e.target.value;
                                void persistOverride('standing_override', v === 'auto'
                                  ? null
                                  : { tier: v, set_at: new Date().toISOString() });
                              }}
                              className="w-full bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-sm focus:border-emerald-500/60 focus:outline-none"
                            >
                              <option value="auto">
                                Auto{standing?.tier ? ` — computed: ${tierLabels[standing.tier] ?? standing.tier}` : ''}
                              </option>
                              <option value="inner_circle">Inner circle</option>
                              <option value="close">Close</option>
                              <option value="regular">Regular</option>
                              <option value="peripheral">Peripheral</option>
                            </select>
                            {overrideTier && (
                              <p className="text-xs text-emerald-300/80 mt-2">Set by you — overrides the computed tier.</p>
                            )}
                          </div>

                          <div>
                            <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">
                              Impact on me
                              {impactOverride !== null && <span className="ml-2 text-emerald-300">{impactOverride}/100</span>}
                            </label>
                            {impactOverride === null ? (
                              <button
                                type="button"
                                data-testid="impact-override-enable"
                                onClick={() => void persistOverride('impact_override',
                                  Math.round(editedCharacter.analytics?.character_influence_on_user ?? 50))}
                                className="w-full bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white/70 text-sm text-left hover:border-emerald-500/60 transition-colors"
                              >
                                Auto ({Math.round(editedCharacter.analytics?.character_influence_on_user ?? 0)}/100 computed) — click to set your own
                              </button>
                            ) : (
                              <div className="bg-black/80 border-2 border-emerald-500/40 rounded-lg px-4 py-3">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={impactOverride}
                                  aria-label="Impact on me"
                                  title="Impact on me"
                                  data-testid="impact-override-slider"
                                  onChange={(e) => setMeta('impact_override', Number(e.target.value))}
                                  onPointerUp={(e) => void persistOverride('impact_override', Number((e.currentTarget as HTMLInputElement).value))}
                                  className="w-full accent-emerald-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => void persistOverride('impact_override', null)}
                                  className="text-xs text-white/50 hover:text-white/80 mt-1"
                                >
                                  Reset to auto
                                </button>
                              </div>
                            )}
                            <p className="text-xs text-white/50 mt-2">
                              Someone can be a minor presence in your story and still shape you deeply.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Relationship Proximity Section */}
                <Card className="bg-gradient-to-br from-orange-500/20 via-orange-600/15 to-orange-500/20 border-2 border-orange-500/40 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/40">
                        <Network className="h-5 w-5 text-orange-300" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Relationship & Proximity</h3>
                  </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Proximity Level</label>
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 min-h-[52px] flex items-center shadow-inner">
                          {editedCharacter.proximity_level ? (
                            <Tooltip content={getProximityTooltip(editedCharacter.proximity_level)}>
                              <Badge variant="outline" className="bg-orange-500/20 text-orange-300 border-orange-500/50 text-sm px-4 py-2 font-semibold shadow-md cursor-help">
                                {editedCharacter.proximity_level === 'direct' ? 'Direct (Know them directly)' :
                                 editedCharacter.proximity_level === 'indirect' ? 'Indirect (Through someone else)' :
                                 editedCharacter.proximity_level === 'distant' ? 'Distant (Barely know them)' :
                                 editedCharacter.proximity_level === 'unmet' ? 'Unmet (Never met)' :
                                 editedCharacter.proximity_level === 'third_party' ? 'Third Party (Mentioned by others)' :
                                 editedCharacter.proximity_level}
                              </Badge>
                            </Tooltip>
                          ) : (
                            <UnknownField
                              label="Proximity"
                              prompt={`How directly I know ${editedCharacter.name}: `}
                              onAskInChat={askInChat}
                            />
                          )}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Relationship Depth</label>
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 min-h-[52px] flex items-center shadow-inner">
                          {editedCharacter.relationship_depth ? (
                            <Tooltip content={getRelationshipDepthTooltip(editedCharacter.relationship_depth)}>
                              <Badge variant="outline" className="bg-orange-500/20 text-orange-300 border-orange-500/50 text-sm px-4 py-2 font-semibold capitalize shadow-md cursor-help">
                                {editedCharacter.relationship_depth}
                              </Badge>
                            </Tooltip>
                          ) : (
                            <UnknownField
                              label="Relationship depth"
                              prompt={`How close ${editedCharacter.name} and I are: `}
                              onAskInChat={askInChat}
                            />
                          )}
                        </div>
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="flex items-center gap-4 bg-black/40 rounded-lg p-4 border border-orange-500/30">
                        {editedCharacter.has_met == null ? (
                          <UnknownField
                            label="Met in person"
                            prompt={`Have I met ${editedCharacter.name} in person? `}
                            onAskInChat={askInChat}
                          />
                        ) : (
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center shadow-md ${
                            editedCharacter.has_met ? 'bg-green-500 border-green-400' : 'bg-black/60 border-border/50'
                          }`}>
                            {editedCharacter.has_met && <span className="text-white text-sm font-bold">✓</span>}
                          </div>
                        )}
                        <label className="text-base font-semibold text-white">
                        Have met in person
                      </label>
                    </div>

                    <div>
                        <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Likelihood to Meet</label>
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 min-h-[52px] flex items-center shadow-inner">
                          {editedCharacter.likelihood_to_meet ? (
                            <Tooltip content={getLikelihoodToMeetTooltip(editedCharacter.likelihood_to_meet)}>
                              <Badge variant="outline" className="bg-orange-500/20 text-orange-300 border-orange-500/50 text-sm px-4 py-2 font-semibold capitalize shadow-md cursor-help">
                                {editedCharacter.likelihood_to_meet}
                              </Badge>
                            </Tooltip>
                          ) : (
                            <UnknownField
                              label="Likelihood to meet"
                              prompt={`Whether I'm likely to meet ${editedCharacter.name}: `}
                              onAskInChat={askInChat}
                            />
                          )}
                        </div>
                    </div>
                  </div>

                  {editedCharacter.context_of_mention && (
                      <div className="mb-6">
                        <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Context of Mention</label>
                        <div className="bg-black/80 border-2 border-border/60 rounded-lg p-4 text-white text-base min-h-[80px] leading-relaxed shadow-inner">
                          {editedCharacter.context_of_mention}
                        </div>
                    </div>
                  )}

                    <div className="bg-black/40 rounded-lg p-4 border border-orange-500/20">
                      <p className="text-sm text-white/80 flex items-start gap-2 leading-relaxed">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-300" />
                    <span>Proximity tracks how directly you know this person. Use "Third Party" for people mentioned by others that you don't know personally.</span>
                  </p>
                </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-3 gap-6">
                  <Card className="bg-gradient-to-br from-green-500/20 via-green-600/15 to-green-500/20 border-2 border-green-500/40 shadow-lg">
                    <CardContent className="p-5">
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Pronouns</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-inner">
                        {editedCharacter.pronouns || (
                          <UnknownField
                            label="Pronouns"
                            prompt={`${editedCharacter.name}'s pronouns are `}
                            onAskInChat={askInChat}
                          />
                        )}
                  </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-pink-500/20 via-pink-600/15 to-pink-500/20 border-2 border-pink-500/40 shadow-lg">
                    <CardContent className="p-5">
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Archetype</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-inner">
                        {editedCharacter.archetype || (
                          <UnknownField
                            label="Archetype"
                            prompt={`The role ${editedCharacter.name} plays in my story: `}
                            onAskInChat={askInChat}
                          />
                        )}
                  </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-cyan-500/20 via-cyan-600/15 to-cyan-500/20 border-2 border-cyan-500/40 shadow-lg">
                    <CardContent className="p-5">
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Role</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-inner">
                        {editedCharacter.role || (
                          <UnknownField
                            label="Role"
                            prompt={`${editedCharacter.name}'s role in my life: `}
                            onAskInChat={askInChat}
                          />
                        )}
                  </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-gradient-to-br from-indigo-500/20 via-indigo-600/15 to-indigo-500/20 border-2 border-indigo-500/40 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-indigo-500/20 border border-indigo-500/40">
                        <Tag className="h-5 w-5 text-indigo-300" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Tags</h3>
                    </div>
                    {editedCharacter.tags && editedCharacter.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {editedCharacter.tags.map((tag) => (
                          <Tooltip key={tag} content={getTagTooltip(tag)}>
                      <Badge
                        variant="outline"
                              className="px-4 py-2 text-sm bg-indigo-500/20 text-indigo-300 border-indigo-500/50 font-semibold shadow-md cursor-help"
                      >
                        {tag}
                      </Badge>
                          </Tooltip>
                    ))}
                  </div>
                    ) : (
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white/50 text-base min-h-[52px] flex items-center italic">
                        No tags assigned
                </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {!loadingDetails && activeTab === 'social' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </label>
                  <Input
                    value={editedCharacter.social_media?.instagram || ''}
                    onChange={(e) => updateSocialMedia('instagram', e.target.value)}
                    placeholder="@username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Twitter className="h-4 w-4" />
                    Twitter/X
                  </label>
                  <Input
                    value={editedCharacter.social_media?.twitter || ''}
                    onChange={(e) => updateSocialMedia('twitter', e.target.value)}
                    placeholder="@username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </label>
                  <Input
                    value={editedCharacter.social_media?.facebook || ''}
                    onChange={(e) => updateSocialMedia('facebook', e.target.value)}
                    placeholder="username or profile URL"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </label>
                  <Input
                    value={editedCharacter.social_media?.linkedin || ''}
                    onChange={(e) => updateSocialMedia('linkedin', e.target.value)}
                    placeholder="username or profile URL"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub
                  </label>
                  <Input
                    value={editedCharacter.social_media?.github || ''}
                    onChange={(e) => updateSocialMedia('github', e.target.value)}
                    placeholder="username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Website
                  </label>
                  <Input
                    value={editedCharacter.social_media?.website || ''}
                    onChange={(e) => updateSocialMedia('website', e.target.value)}
                    placeholder="https://..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                  <Input
                    type="email"
                    value={editedCharacter.social_media?.email || ''}
                    onChange={(e) => updateSocialMedia('email', e.target.value)}
                    placeholder="email@example.com"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone
                  </label>
                  <Input
                    type="tel"
                    value={editedCharacter.social_media?.phone || ''}
                    onChange={(e) => updateSocialMedia('phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>
              </div>
            )}

            {!loadingDetails && activeTab === 'relationships' && (
              <div className="space-y-6">
                {/* Relationship to You */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Relationship to You
                  </h3>
                  <Card className="bg-gradient-to-br from-primary/10 to-purple-900/20 border-primary/30">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        {editedCharacter.role && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Role</span>
                            <p className="text-white font-medium">{editedCharacter.role}</p>
                          </div>
                        )}
                        {editedCharacter.archetype && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Archetype</span>
                            <p className="text-white font-medium">{editedCharacter.archetype}</p>
                          </div>
                        )}
                        {editedCharacter.summary && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Summary</span>
                            <p className="text-white/80 text-sm mt-1">{editedCharacter.summary}</p>
                          </div>
                        )}
                        {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Closeness</span>
                            {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name) && (
                              <div className="mt-1">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-black/40 rounded-full h-2">
                                    <div 
                                      className="bg-primary h-2 rounded-full"
                                      style={{ 
                                        width: `${((editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 0) / 10) * 100}%` 
                                      }}
                                    />
                                  </div>
                                  <span className="text-sm text-white/70">
                                    {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 0}/10
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Family Tree */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <TreePine className="h-5 w-5 text-primary" />
                    Family Tree
                  </h3>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      {isMockDataEnabled ? (() => {
                        const mockTree =
                          createMockFamilyTreeForCharacter(editedCharacter.name) ??
                          createMockUserFamilyTree();
                        return (
                          <FamilyTreeView
                            tree={mockTree}
                            onMemberClick={(member) => {
                              if (!member.is_self) {
                                setSelectedCharacterForModal({
                                  id: member.id,
                                  name: member.name,
                                } as Character);
                              }
                            }}
                          />
                        );
                      })() : (
                        <RelationshipTreeView
                          entityId={editedCharacter.id}
                          entityType="character"
                          defaultCategory="family"
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Friends & Other Connections */}
                {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <UserCircle className="h-5 w-5 text-primary" />
                      Friends & Other Connections
                    </h3>
                    <div className="space-y-2">
                      {editedCharacter.relationships
                        .filter(rel => rel.character_name && rel.character_name !== 'You')
                        .map((rel) => (
                          <Card 
                            key={rel.id} 
                            className="bg-black/40 border-border/50 cursor-pointer hover:border-primary/50 hover:bg-black/60 transition-all"
                            onClick={() => void openCharacterByRelationship(rel)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-white">{rel.character_name}</p>
                                    <Tooltip content={`Relationship Type: "${rel.relationship_type}" describes how ${rel.character_name} relates to ${editedCharacter.name}. This is automatically detected from your conversations when you describe their connection.`}>
                                      <span className="text-xs text-primary/70 px-2 py-0.5 rounded bg-primary/10 border border-primary/20 cursor-help">
                                      {rel.relationship_type}
                                    </span>
                                    </Tooltip>
                                  </div>
                                  {rel.summary && <p className="text-sm text-white/60 mt-1">{rel.summary}</p>}
                                </div>
                                {rel.closeness_score !== undefined && (
                                  <div className="text-right ml-4">
                                    <span className="text-xs text-white/50 block">Closeness</span>
                                    <span className="text-sm font-medium text-primary">{rel.closeness_score}/10</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      {editedCharacter.relationships.filter(rel => rel.character_name && rel.character_name !== 'You').length === 0 && (
                        <div className="text-center py-8 text-white/40">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No connections tracked yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Groups & Organizations */}
                {(() => {
                  const orgs = isMockDataEnabled ? getMockOrganizations() : characterOrganizations;
                  const shared = orgs.filter((o: any) => o.user_is_member);
                  const theirs = orgs.filter((o: any) => !o.user_is_member);
                  const OrgCard = ({ org, isShared }: { org: any; isShared: boolean }) => (
                    <div
                      key={org.id}
                      onClick={() => setSelectedOrganization(org)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                        isShared
                          ? 'bg-green-500/8 border-green-500/25 hover:bg-green-500/15 hover:border-green-500/40'
                          : 'bg-white/4 border-white/10 hover:bg-white/8 hover:border-white/20'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-white/90 truncate">{org.name}</p>
                          <Badge variant="outline" className={`text-[10px] py-0 ${
                            org.group_type === 'community' ? 'border-emerald-500/25 text-emerald-300' :
                            org.group_type === 'club' ? 'border-blue-500/25 text-blue-300' :
                            org.group_type === 'institution' ? 'border-purple-500/25 text-purple-300' :
                            org.group_type === 'company' ? 'border-orange-500/25 text-orange-300' :
                            org.group_type === 'sports_team' ? 'border-cyan-500/25 text-cyan-300' :
                            'border-white/15 text-white/45'
                          }`}>{(org.group_type ?? org.type)?.replace(/_/g, ' ')}</Badge>
                        </div>
                        {org.description && <p className="text-xs text-white/45 mt-0.5 truncate">{org.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/30">
                          {org.character_role && <span className="text-white/50">{org.character_role}</span>}
                          {org.member_count > 0 && <span>{org.member_count} members</span>}
                          {org.confidence != null && <span>{Math.round(org.confidence * 100)}% confidence</span>}
                        </div>
                        {org.character_member_notes && (
                          <p className="text-[10px] text-white/35 mt-1 line-clamp-1">{org.character_member_notes}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={`flex-shrink-0 text-[10px] py-0 mt-0.5 ${
                        isShared
                          ? 'bg-green-500/15 text-green-300 border-green-500/30'
                          : 'bg-white/5 text-white/35 border-white/15'
                      }`}>
                        {isShared ? 'Shared' : 'Theirs'}
                      </Badge>
                    </div>
                  );
                  return (
                    <div>
                      <h3 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Groups &amp; Organizations
                        <span className="ml-auto text-[10px] text-white/30">{orgs.length} total</span>
                      </h3>
                      {orgs.length === 0 && (
                        <p className="text-xs text-white/30 italic text-center py-4">No group memberships detected yet.</p>
                      )}
                      {shared.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">You are both in</p>
                          <div className="space-y-2">
                            {shared.map((org: any) => <OrgCard key={org.id} org={org} isShared={true} />)}
                          </div>
                        </div>
                      )}
                      {theirs.length > 0 && (
                        <div>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                            {editedCharacter.name.split(' ')[0]}&apos;s groups
                          </p>
                          <div className="space-y-2">
                            {theirs.map((org: any) => <OrgCard key={org.id} org={org} isShared={false} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Associated Characters (for indirect/third-party characters) */}
                {(editedCharacter.proximity_level === 'indirect' || editedCharacter.proximity_level === 'third_party' || editedCharacter.associated_with_character_ids) && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-primary" />
                      Associated With
                    </h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        {editedCharacter.associated_with_character_ids && editedCharacter.associated_with_character_ids.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm text-white/70 mb-3">
                              This person is connected to or mentioned by:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {editedCharacter.associated_with_character_ids.map((charId) => {
                                // Try to find character name from relationships or metadata
                                const associatedChar = editedCharacter.relationships?.find(r => r.character_id === charId);
                                return (
                                  <Badge
                                    key={charId}
                                    variant="outline"
                                    className="bg-blue-500/10 text-blue-400 border-blue-500/30 px-3 py-1.5"
                                  >
                                    {associatedChar?.character_name || `Character ${charId.slice(0, 8)}...`}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-white/40">
                            <Link2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No associated characters</p>
                            <p className="text-xs mt-1">This person is not linked to any other characters</p>
                          </div>
                        )}
                        {editedCharacter.context_of_mention && (
                          <div className="mt-4 pt-4 border-t border-border/30">
                            <p className="text-xs text-white/50 mb-1">Context:</p>
                            <p className="text-sm text-white/70">{editedCharacter.context_of_mention}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {!loadingDetails && activeTab === 'perceptions' && (
              <CharacterPerceptionsTab
                personId={editedCharacter.id}
                personName={editedCharacter.name}
              />
            )}

            {!loadingDetails && activeTab === 'history' && (
              <div className="space-y-5">
                {loadingMemories && (
                  <div className="flex items-center gap-2 py-6 text-white/40 text-sm justify-center">
                    <Clock className="h-4 w-4 animate-spin" /><span>Loading memories...</span>
                  </div>
                )}

                {!loadingMemories && sharedMemoryCards.length === 0 && (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium mb-1">No shared memories yet</p>
                    <p className="text-xs">Memories appear here as you mention {editedCharacter.name.split(' ')[0]} in your journal entries</p>
                  </div>
                )}

                {!loadingMemories && sharedMemoryCards.length > 0 && (() => {
                  const memories = [...sharedMemoryCards].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const firstName = editedCharacter.name.split(' ')[0];

                  // ── 6. Relationship arc header (uses dynamics if loaded) ────
                  const stageHistory: Array<{ stage: string; start_date: string }> = dynamics?.lifecycle?.stage_history ?? [];

                  // ── 4. First memory + most significant ─────────────────────
                  const firstMemory = memories[0];
                  const mostSignificant = [...memories].sort((a, b) =>
                    (b.content?.length ?? 0) - (a.content?.length ?? 0)
                  )[0];
                  const hasBothHighlights = firstMemory && mostSignificant && firstMemory.id !== mostSignificant.id;

                  // ── 3. Group by era (chapter title or year) ────────────────
                  const grouped: Record<string, MemoryCard[]> = {};
                  memories.forEach(m => {
                    const era = m.chapterTitle || String(new Date(m.date).getFullYear());
                    if (!grouped[era]) grouped[era] = [];
                    grouped[era].push(m);
                  });
                  const eras = Object.entries(grouped).sort((a, b) => {
                    const dateA = new Date(a[1][0].date).getTime();
                    const dateB = new Date(b[1][0].date).getTime();
                    return dateA - dateB;
                  });

                  // ── MemoryRow component ────────────────────────────────────
                  const MemoryRow = ({ memory, highlight }: { memory: MemoryCard; highlight?: string }) => (
                    <div
                      key={memory.id}
                      className={`group rounded-xl border transition-colors cursor-pointer ${
                        highlight
                          ? 'border-primary/30 bg-primary/5 hover:bg-primary/8'
                          : 'border-white/8 bg-white/3 hover:bg-white/6'
                      }`}
                      onClick={() => setSelectedMemory(memory)}
                    >
                      <div className="p-3 flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 text-center pt-0.5">
                          <p className="text-[9px] text-white/30 leading-tight">
                            {new Date(memory.date).toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                          <p className="text-xs font-semibold text-white/50">
                            {new Date(memory.date).getFullYear().toString().slice(2)}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          {highlight && (
                            <span className="text-[9px] font-semibold text-primary/70 uppercase tracking-widest block mb-0.5">{highlight}</span>
                          )}
                          <p className="text-sm font-medium text-white/85 leading-snug">{memory.title}</p>
                          {memory.content && (
                            <p className="text-xs text-white/50 mt-1 leading-snug line-clamp-2">
                              {memory.content.length > 120 ? memory.content.substring(0, 120) + '…' : memory.content}
                            </p>
                          )}
                          {memory.mood && (
                            <span className="text-[9px] text-white/30 mt-1 block">{memory.mood}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <>
                      {/* ── 6. Relationship Arc Header ─────────────────────── */}
                      {stageHistory.length > 0 && (
                        <div className="mb-1">
                          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Relationship Arc</p>
                          <div className="flex items-center gap-1 overflow-x-auto pb-1">
                            {stageHistory.map((s, i) => (
                              <div key={i} className="flex items-center gap-1 flex-shrink-0">
                                <div className={`px-2 py-1 rounded text-[10px] font-medium ${
                                  i === stageHistory.length - 1
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'bg-white/5 text-white/35'
                                }`}>
                                  <span className="capitalize">{s.stage}</span>
                                  {s.start_date && (
                                    <span className="ml-1 opacity-50">{new Date(s.start_date).getFullYear()}</span>
                                  )}
                                </div>
                                {i < stageHistory.length - 1 && <span className="text-white/20">→</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── 4. Pinned highlights ───────────────────────────── */}
                      {(firstMemory || mostSignificant) && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Highlights</p>
                          <MemoryRow memory={firstMemory} highlight="First memory" />
                          {hasBothHighlights && <MemoryRow memory={mostSignificant} highlight="Most significant" />}
                        </div>
                      )}

                      {/* ── 3. Memories grouped by era ────────────────────── */}
                      <div className="space-y-5">
                        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Full Story</p>
                        {eras.map(([era, eraMemories]) => (
                          <div key={era}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-px flex-1 bg-white/8" />
                              <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-1">{era}</span>
                              <div className="h-px flex-1 bg-white/8" />
                            </div>
                            <div className="space-y-2">
                              {eraMemories.map(m => <MemoryRow key={m.id} memory={m} />)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ── 5. Perception events integrated ──────────────── */}
                      <div className="pt-3 border-t border-white/8">
                        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">
                          Beliefs About {firstName}
                        </p>
                        <p className="text-xs text-white/35 mb-3">
                          How your understanding of {firstName} has evolved over time.
                          Open the Perceptions tab for the full picture.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('perceptions')}
                          className="text-xs text-primary/60 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View perceptions about {firstName}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Chat Tab */}
            {!loadingDetails && activeTab === 'chat' && (
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="h-6 w-6 text-primary" />
                    Chat about {editedCharacter.name}
                  </h3>
                  <p className="text-base text-white/70">
                    Ask questions, share stories, or update information about {editedCharacter.name} through conversation.
                  </p>
                </div>
                
                {/* Messages Area - Chat composer moved to sticky area */}
                <div className="space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 text-white/60">
                      <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50 text-primary" />
                      <p className="text-lg mb-2">Start a conversation about {editedCharacter.name}</p>
                      <div className="mt-4 space-y-2 text-sm text-white/50">
                        <p className="font-semibold text-white/70">Try asking:</p>
                        <p>"Tell me more about {editedCharacter.name}"</p>
                        <p>"What do I know about {editedCharacter.name}?"</p>
                        <p>"Update {editedCharacter.name}'s role to..."</p>
                        <p>"Add to {editedCharacter.name}'s story: ..."</p>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => {
                      const message: Message = {
                        id: `msg-${idx}`,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp
                      };
                      return (
                        <ChatMessage
                          key={idx}
                          message={message}
                          onCopy={() => navigator.clipboard.writeText(msg.content)}
                        />
                      );
                    })
                  )}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <Card className="bg-black/40 border-border/50 max-w-[80%]">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-white/60">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            <span>Thinking...</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Composer — only shown in Chat tab */}
                <div className="pt-3 border-t border-white/10">
                  <ChatComposer
                    onSubmit={handleChatSubmit}
                    loading={chatLoading}
                    initialPrompt={chatPrefill}
                  />
                </div>
              </div>
            )}

            {/* Insights Tab */}
            {!loadingDetails && activeTab === 'insights' && (
              <div className="space-y-6">
                {(() => {
                  const analytics = editedCharacter.analytics ?? (isMockDataEnabled ? generateMockAnalytics(editedCharacter) : null);
                  if (!analytics) return (
                    <div className="text-center py-12 text-white/40">
                      <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No analytics data yet — keep journaling about {editedCharacter.name.split(' ')[0]}.</p>
                    </div>
                  );
                  const firstName = editedCharacter.name.split(' ')[0];

                  // ── 1. Relationship Sentence ────────────────────────────────
                  const phaseLabel = (() => {
                    const c = analytics.closeness_score ?? 0;
                    const r = analytics.recency_score ?? 0;
                    if (c >= 70 && r >= 0.6) return 'a Core relationship';
                    if (c >= 45 || r >= 0.4) return 'an Active relationship';
                    if (c >= 20 || r >= 0.2) return 'a Fading relationship';
                    return 'a Dormant relationship';
                  })();
                  const trendPhrase = analytics.trend === 'deepening' ? 'currently deepening' : analytics.trend === 'weakening' ? 'showing signs of distance' : 'holding steady';
                  const influencePhrase = (() => {
                    const inf = analytics.character_influence_on_user ?? 0;
                    if (inf >= 75) return `${firstName}'s influence on your decisions and outlook is significant`;
                    if (inf >= 50) return `${firstName} has a meaningful influence on how you think and act`;
                    return `${firstName}'s presence in your story is noted but not dominant`;
                  })();
                  const durationPhrase = (() => {
                    const days = analytics.relationship_duration_days ?? 0;
                    if (days >= 1095) return `over ${Math.floor(days / 365)} years`;
                    if (days >= 365) return 'over a year';
                    if (days >= 90) return 'several months';
                    return 'a few months';
                  })();
                  const relationshipSentence = `${firstName} is ${phaseLabel} — ${trendPhrase} after ${durationPhrase} together. ${influencePhrase}.`;

                  // ── 2. Why This Person Matters ────────────────────────────
                  const whyMatters: string[] = [];
                  if ((analytics.character_influence_on_user ?? 0) >= 70) whyMatters.push(`High influence — ${firstName} consistently shapes how you think and the decisions you make`);
                  if ((analytics.closeness_score ?? 0) >= 75) whyMatters.push(`Deep closeness — this is one of your most connected relationships`);
                  if ((analytics.shared_experiences ?? 0) >= 10) whyMatters.push(`${analytics.shared_experiences} shared experiences — a relationship built through real moments`);
                  if (analytics.trend === 'deepening') whyMatters.push(`This relationship is actively growing stronger`);
                  if ((analytics.support_score ?? 0) >= 70) whyMatters.push(`High support score — ${firstName} shows up when it matters`);
                  if ((analytics.trust_score ?? 0) >= 80) whyMatters.push(`Exceptional trust — rare at this level`);
                  if (dynamics?.lifecycle?.current_stage === 'deepening') whyMatters.push(`Currently in the deepening stage of relationship development`);
                  // Add influence insights if loaded
                  if (influenceInsights?.length) {
                    influenceInsights.slice(0, 2).forEach(i => {
                      if (i.type === 'positive_influence' || i.type === 'uplifting_person') whyMatters.push(i.message);
                    });
                  }

                  // ── Score → plain-language reason helpers ──────────────
                  const closenessWhy = analytics.closeness_score >= 80
                    ? `${analytics.shared_experiences ?? 0} shared experiences + consistently high emotional depth in conversations`
                    : analytics.closeness_score >= 55
                    ? `Regular contact and moderate emotional engagement across ${analytics.shared_experiences ?? 0} memories`
                    : `Still building — fewer shared moments recorded so far`;
                  const importanceWhy = analytics.importance_score >= 80
                    ? `${firstName} appears during pivotal moments — career decisions, personal milestones, and major transitions`
                    : analytics.importance_score >= 55
                    ? `Steady presence across multiple areas of your life over time`
                    : `Mentioned occasionally — not yet a central figure in your story`;
                  const priorityWhy = analytics.priority_score >= 70
                    ? `High closeness + recent activity signals this relationship deserves active attention now`
                    : analytics.priority_score >= 45
                    ? `Moderate engagement — worth maintaining but not urgent`
                    : `Low recent activity — this relationship may need re-engagement`;
                  const engagementWhy = analytics.engagement_score >= 70
                    ? `Frequent, consistent interactions over the last 90 days`
                    : analytics.engagement_score >= 45
                    ? `Moderate interaction — you stay in touch but not constantly`
                    : `Infrequent contact recently — engagement has tapered off`;
                  const trustWhy = analytics.trust_score >= 80
                    ? `High trust — you share personal information and rely on ${firstName} for important decisions`
                    : analytics.trust_score >= 55
                    ? `Moderate trust — you confide in ${firstName} on some things but not everything`
                    : `Trust is still developing with ${firstName}`;
                  const supportWhy = analytics.support_score >= 70
                    ? `${firstName} shows up for you — emotionally present during difficult periods`
                    : analytics.support_score >= 45
                    ? `${firstName} is supportive when needed, though not always available`
                    : `Limited support patterns recorded between you`;
                  const conflictWhy = analytics.conflict_score >= 50
                    ? `Conflict is notable — disagreements or tension appear regularly in your entries`
                    : analytics.conflict_score >= 25
                    ? `Occasional friction, but generally manageable`
                    : `Low conflict — this relationship is largely harmonious`;

                  // ── "Why this matters" bullet colors by content type ────
                  const whyColors = [
                    'border-violet-500/30 bg-violet-950/20 text-violet-300',
                    'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
                    'border-amber-500/30 bg-amber-950/20 text-amber-300',
                    'border-cyan-500/30 bg-cyan-950/20 text-cyan-300',
                    'border-rose-500/30 bg-rose-950/20 text-rose-300',
                  ];

                  return (
                    <>
                      {/* ── Relationship sentence — hero card ── */}
                      <div className="relative p-5 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/12 via-purple-900/15 to-primary/8 overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-widest mb-2">Relationship Summary</p>
                        <p className="text-sm sm:text-base text-white/90 leading-relaxed relative z-10">{relationshipSentence}</p>
                      </div>

                      {/* ── Why this person matters — color-coded bullets ── */}
                      {whyMatters.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2.5">Why {firstName} Matters</p>
                          <div className="space-y-1.5">
                            {whyMatters.slice(0, 5).map((reason, i) => (
                              <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${whyColors[i % whyColors.length]}`}>
                                <div className="h-1.5 w-1.5 rounded-full bg-current mt-1.5 flex-shrink-0 opacity-80" />
                                <p className="text-xs sm:text-sm text-white/85 leading-snug">{reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Full analytics ── */}
                      <div className="pt-1">
                        <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Signal Breakdown</p>

                      <Card className="bg-black/20 border border-white/8">
                      <CardContent className="space-y-6 p-4 sm:p-5">
                        {/* Key Metrics Grid — 4 colored cards with "why" */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Closeness', value: analytics.closeness_score, unit: '%', color: 'from-pink-500/25 to-pink-900/20', border: 'border-pink-500/35', text: 'text-pink-300', why: closenessWhy },
                            { label: 'Importance', value: analytics.importance_score, unit: '%', color: 'from-amber-500/25 to-amber-900/20', border: 'border-amber-500/35', text: 'text-amber-300', why: importanceWhy },
                            { label: 'Priority', value: analytics.priority_score, unit: '%', color: 'from-emerald-500/25 to-emerald-900/20', border: 'border-emerald-500/35', text: 'text-emerald-300', why: priorityWhy },
                            { label: 'Engagement', value: analytics.engagement_score, unit: '%', color: 'from-sky-500/25 to-sky-900/20', border: 'border-sky-500/35', text: 'text-sky-300', why: engagementWhy },
                          ].map(m => (
                            <div key={m.label} className={`rounded-xl border ${m.border} bg-gradient-to-br ${m.color} p-3 sm:p-4`}>
                              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">{m.label}</p>
                              <p className={`text-2xl sm:text-3xl font-bold ${m.text} mb-1.5`}>{m.value}{m.unit}</p>
                              <p className="text-[10px] text-white/45 leading-snug">{m.why}</p>
                            </div>
                          ))}
                        </div>

                        {/* Depth + Frequency compact bars */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Depth', value: analytics.relationship_depth, color: 'bg-purple-500', text: 'text-purple-300', bg: 'bg-purple-950/20 border-purple-500/25', why: `${analytics.shared_experiences} shared experiences recorded — emotional depth derived from conversation patterns` },
                            { label: 'Frequency', value: analytics.interaction_frequency, color: 'bg-sky-500', text: 'text-sky-300', bg: 'bg-sky-950/20 border-sky-500/25', why: `Based on mentions and contact events in the last 90 days` },
                          ].map(m => (
                            <div key={m.label} className={`rounded-xl border p-3 sm:p-4 ${m.bg}`}>
                              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">{m.label}</p>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className={`h-full ${m.color} rounded-full`} style={{ width: `${m.value}%` }} />
                                </div>
                                <span className={`text-sm font-bold tabular-nums ${m.text}`}>{m.value}%</span>
                              </div>
                              <p className="text-[10px] text-white/40 leading-snug">{m.why}</p>
                            </div>
                          ))}
                        </div>

                        {/* ── 7. Bidirectional Influence Bar ───────────── */}
                        <div className="p-4 rounded-xl border border-white/10 bg-white/4 space-y-3">
                          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Influence Dynamic</p>
                          <div className="space-y-3">
                            {/* Their influence on you */}
                            <div>
                              <div className="flex justify-between text-xs text-white/45 mb-1">
                                <span>{editedCharacter.name.split(' ')[0]}&apos;s influence on you</span>
                                <span className="font-semibold text-white/70">{analytics.character_influence_on_user}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-violet-500 rounded-full"
                                    style={{ width: `${analytics.character_influence_on_user}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-white/30 w-6">←</span>
                              </div>
                            </div>
                            {/* Your influence on them */}
                            <div>
                              <div className="flex justify-between text-xs text-white/45 mb-1">
                                <span>Your influence on {editedCharacter.name.split(' ')[0]}</span>
                                <span className="font-semibold text-white/70">{analytics.user_influence_over_character}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cyan-500 rounded-full"
                                    style={{ width: `${analytics.user_influence_over_character}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-white/30 w-6">→</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-white/25 leading-snug">
                            {analytics.character_influence_on_user > analytics.user_influence_over_character + 15
                              ? `${editedCharacter.name.split(' ')[0]} has more influence over you than you have over them — this relationship shapes you significantly.`
                              : analytics.user_influence_over_character > analytics.character_influence_on_user + 15
                              ? `You have more influence in this relationship than ${editedCharacter.name.split(' ')[0]} does.`
                              : 'Balanced influence — this relationship is roughly reciprocal.'}
                          </p>
                        </div>

                        {/* Social + Additional signals — compact 2-col grid with "why" */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Sentiment',  value: `${analytics.sentiment_score > 0 ? '+' : ''}${analytics.sentiment_score}`, pct: Math.max(0, Math.min(100, analytics.sentiment_score + 50)), color: 'from-green-500/20 to-green-900/15', border: 'border-green-500/30', text: analytics.sentiment_score >= 0 ? 'text-green-300' : 'text-red-300', bar: analytics.sentiment_score >= 0 ? 'bg-green-500' : 'bg-red-500', why: trustWhy },
                            { label: 'Trust',      value: `${analytics.trust_score}%`,  pct: analytics.trust_score,    color: 'from-blue-500/20 to-blue-900/15',    border: 'border-blue-500/30',    text: 'text-blue-300',    bar: 'bg-blue-500',    why: trustWhy },
                            { label: 'Support',    value: `${analytics.support_score}%`, pct: analytics.support_score,  color: 'from-teal-500/20 to-teal-900/15',    border: 'border-teal-500/30',    text: 'text-teal-300',    bar: 'bg-teal-500',    why: supportWhy },
                            { label: 'Conflict',   value: `${analytics.conflict_score}%`, pct: analytics.conflict_score, color: 'from-red-500/20 to-red-900/15',      border: 'border-red-500/30',     text: 'text-red-300',     bar: 'bg-red-500',     why: conflictWhy },
                            { label: 'Value',      value: `${analytics.value_score}%`,   pct: analytics.value_score,    color: 'from-amber-500/20 to-amber-900/15',  border: 'border-amber-500/30',   text: 'text-amber-300',   bar: 'bg-amber-500',   why: `How much ${firstName} enriches your life beyond just frequency of contact` },
                            { label: 'Activity',   value: `${analytics.activity_level}%`, pct: analytics.activity_level, color: 'from-violet-500/20 to-violet-900/15', border: 'border-violet-500/30', text: 'text-violet-300',  bar: 'bg-violet-500',  why: `How active this relationship has been recently across conversations and entries` },
                          ].map(m => (
                            <div key={m.label} className={`rounded-xl border ${m.border} bg-gradient-to-br ${m.color} p-3`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{m.label}</p>
                                <p className={`text-sm font-bold tabular-nums ${m.text}`}>{m.value}</p>
                              </div>
                              <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1.5">
                                <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${m.pct}%` }} />
                              </div>
                              <p className="text-[9px] text-white/35 leading-snug line-clamp-2">{m.why}</p>
                            </div>
                          ))}
                        </div>

                        {/* Trend — compact pill */}
                        <div className={`rounded-xl border p-3 flex items-center gap-3 ${
                          analytics.trend === 'deepening' ? 'border-emerald-500/30 bg-emerald-950/20' :
                          analytics.trend === 'weakening' ? 'border-red-500/30 bg-red-950/20' :
                          'border-white/10 bg-white/5'
                        }`}>
                          <div className={`flex items-center gap-1.5 text-sm font-semibold ${
                            analytics.trend === 'deepening' ? 'text-emerald-300' :
                            analytics.trend === 'weakening' ? 'text-red-300' : 'text-white/60'
                          }`}>
                            {analytics.trend === 'deepening' && <TrendingUp className="h-4 w-4" />}
                            {analytics.trend === 'weakening' && <TrendingDown className="h-4 w-4" />}
                            {analytics.trend === 'stable' && <Minus className="h-4 w-4" />}
                            <span className="capitalize">{analytics.trend}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/50 leading-snug">
                              {analytics.trend === 'deepening'
                                ? `This relationship is growing stronger — interaction quality and frequency are both increasing`
                                : analytics.trend === 'weakening'
                                ? `Signs of distance — contact has reduced and emotional intensity is lower than historical average`
                                : `This relationship has held consistent — no major shifts in either direction`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-white/30">Known for</p>
                            <p className="text-sm font-bold text-indigo-300">{analytics.relationship_duration_days}d</p>
                          </div>
                        </div>

                        {/* SWOT Analysis */}
                        {((analytics.strengths?.length ?? 0) > 0 ||
                          (analytics.weaknesses?.length ?? 0) > 0 ||
                          (analytics.opportunities?.length ?? 0) > 0 ||
                          (analytics.risks?.length ?? 0) > 0) && (
                          <div>
                            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                              <Lightbulb className="h-5 w-5 text-yellow-400" />
                              SWOT Analysis
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                              {analytics.strengths && analytics.strengths.length > 0 && (
                                <Card className="bg-gradient-to-br from-green-500/20 via-green-600/15 to-green-500/20 border-2 border-green-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-green-300 mb-3 flex items-center gap-2">
                                      <Zap className="h-4 w-4" />
                                      Strengths
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.strengths.map((strength, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-green-400 mt-1">•</span>
                                          <span>{strength}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                              )}
                              {analytics.weaknesses && analytics.weaknesses.length > 0 && (
                                <Card className="bg-gradient-to-br from-red-500/20 via-red-600/15 to-red-500/20 border-2 border-red-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-red-300 mb-3 flex items-center gap-2">
                                      <AlertCircle className="h-4 w-4" />
                                      Weaknesses
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.weaknesses.map((weakness, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-red-400 mt-1">•</span>
                                          <span>{weakness}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                              )}
                              {analytics.opportunities && analytics.opportunities.length > 0 && (
                                <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-blue-300 mb-3 flex items-center gap-2">
                                      <Star className="h-4 w-4" />
                                      Opportunities
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.opportunities.map((opp, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-blue-400 mt-1">•</span>
                                          <span>{opp}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                              )}
                              {analytics.risks && analytics.risks.length > 0 && (
                                <Card className="bg-gradient-to-br from-orange-500/20 via-orange-600/15 to-orange-500/20 border-2 border-orange-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-orange-300 mb-3 flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4" />
                                      Risks
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.risks.map((risk, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-orange-400 mt-1">•</span>
                                          <span>{risk}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                            )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  </>
                  );
                })()}
              </div>
            )}

            {/* Metadata Tab */}
            {/* ── Intelligence Tab ── */}
            {!loadingDetails && activeTab === 'intelligence' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Relationship Intelligence
                  </h3>
                  <p className="text-xs text-white/45 mt-1">
                    Why does {editedCharacter.name.split(' ')[0]} matter? How have they shaped you?
                  </p>
                </div>

                {(dynamicsLoading || influenceLoading) && (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!dynamicsLoading && !influenceLoading && (
                  <>
                    {/* ── Influence Profile ── */}
                    {influenceProfile && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Influence on Your Life</h4>
                        <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-950/10 space-y-4">
                          {/* Net influence gauge */}
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-white/50 mb-1">
                                <span>Net Influence</span>
                                <span className="font-semibold text-yellow-300">{Math.round((influenceProfile.net_influence ?? 0) * 100)}%</span>
                              </div>
                              <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full" style={{ width: `${Math.round((influenceProfile.net_influence ?? 0) * 100)}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* Impact grid */}
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Emotional Impact', val: influenceProfile.emotional_impact, color: 'text-pink-300', bg: 'bg-pink-500' },
                              { label: 'Behavioral Impact', val: influenceProfile.behavioral_impact, color: 'text-blue-300', bg: 'bg-blue-500' },
                              { label: 'Uplift Score', val: influenceProfile.uplift_score, color: 'text-emerald-300', bg: 'bg-emerald-500' },
                              { label: 'Toxicity Score', val: influenceProfile.toxicity_score, color: 'text-red-300', bg: 'bg-red-500', invert: true },
                            ].map(({ label, val, color, bg, invert }) => {
                              const pct = Math.round(Math.abs(val ?? 0) * 100);
                              const display = invert ? 100 - pct : pct;
                              return (
                                <div key={label} className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                                  <p className="text-[10px] text-white/40 mb-1">{label}</p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                                      <div className={`h-full ${bg}/60 rounded-full`} style={{ width: `${display}%` }} />
                                    </div>
                                    <span className={`text-xs font-semibold ${color}`}>{pct}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Interaction count */}
                          {influenceProfile.interaction_count > 0 && (
                            <p className="text-[10px] text-white/30 pt-1 border-t border-white/8">
                              Based on {influenceProfile.interaction_count} recorded interactions
                            </p>
                          )}
                        </div>

                        {/* Influence insights */}
                        {influenceInsights.length > 0 && (
                          <div className="space-y-2">
                            {influenceInsights.slice(0, 4).map((insight: any, i: number) => {
                              const insightColors: Record<string, string> = {
                                positive_influence:      'border-emerald-500/25 bg-emerald-950/15 text-emerald-300',
                                uplifting_person:        'border-emerald-500/20 bg-emerald-950/10 text-emerald-200',
                                toxic_pattern:           'border-red-500/25 bg-red-950/15 text-red-300',
                                behavior_shift_detected: 'border-blue-500/25 bg-blue-950/15 text-blue-300',
                                dominant_influence:      'border-yellow-500/25 bg-yellow-950/15 text-yellow-300',
                                high_risk_person:        'border-orange-500/25 bg-orange-950/15 text-orange-300',
                              };
                              const cls = insightColors[insight.type] ?? 'border-white/10 bg-white/5 text-white/70';
                              return (
                                <div key={i} className={`p-3 rounded-lg border ${cls}`}>
                                  <p className="text-xs leading-relaxed">{insight.message}</p>
                                  {insight.confidence && (
                                    <p className="text-[10px] opacity-50 mt-1">{Math.round(insight.confidence * 100)}% confidence</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Relationship Dynamics ── */}
                    {dynamics && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Relationship Dynamics</h4>

                        {/* Health score */}
                        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-white/40">Relationship Health</p>
                              <p className="text-xl font-bold text-white mt-0.5">
                                {dynamics.health?.health_score ?? 0}
                                <span className="text-xs text-white/40 font-normal ml-1">/100</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-semibold capitalize ${
                                dynamics.health?.overall_health === 'excellent' ? 'text-emerald-400' :
                                dynamics.health?.overall_health === 'good' ? 'text-green-400' :
                                dynamics.health?.overall_health === 'fair' ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>{dynamics.health?.overall_health ?? 'unknown'}</p>
                              {dynamics.health?.trends?.health_trend && (
                                <p className="text-[10px] text-white/40 mt-0.5 capitalize">{dynamics.health.trends.health_trend}</p>
                              )}
                            </div>
                          </div>

                          {/* Health factor bars */}
                          {dynamics.health?.factors && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/8">
                              {Object.entries(dynamics.health.factors as Record<string, number>).map(([key, val]) => (
                                <div key={key}>
                                  <div className="flex justify-between text-[10px] text-white/35 mb-0.5">
                                    <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                                    <span>{Math.round(val)}</span>
                                  </div>
                                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${val}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Stage progression */}
                        {dynamics.lifecycle?.stage_history?.length > 0 && (
                          <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Stage Progression</p>
                            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                              {(dynamics.lifecycle.stage_history as any[]).map((s: any, i: number) => (
                                <div key={i} className="flex items-center gap-1 flex-shrink-0">
                                  <div className={`px-2 py-1 rounded text-[10px] font-medium ${
                                    i === dynamics.lifecycle.stage_history.length - 1
                                      ? 'bg-primary/20 text-primary border border-primary/30'
                                      : 'bg-white/5 text-white/40'
                                  }`}>
                                    <span className="capitalize">{s.stage}</span>
                                    {s.start_date && (
                                      <span className="ml-1 opacity-50 hidden sm:inline">
                                        {new Date(s.start_date).getFullYear()}
                                      </span>
                                    )}
                                  </div>
                                  {i < dynamics.lifecycle.stage_history.length - 1 && (
                                    <span className="text-white/20 text-xs">→</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Metrics row */}
                        {dynamics.metrics && (
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Freq / mo', val: dynamics.metrics.interaction_frequency?.toFixed(1) },
                              { label: 'Sentiment', val: `${Math.round((dynamics.metrics.average_sentiment ?? 0) * 100)}%` },
                              { label: 'Positive', val: `${Math.round((dynamics.metrics.positive_ratio ?? 0) * 100)}%` },
                            ].map(({ label, val }) => (
                              <div key={label} className="p-2 rounded-lg bg-white/5 border border-white/8 text-center">
                                <p className="text-[10px] text-white/35">{label}</p>
                                <p className="text-sm font-semibold text-white/85 mt-0.5">{val ?? '—'}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Strengths + concerns */}
                        {(dynamics.health?.strengths?.length > 0 || dynamics.health?.concerns?.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {dynamics.health.strengths?.length > 0 && (
                              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/10">
                                <p className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider mb-1.5">Strengths</p>
                                <ul className="space-y-1">
                                  {dynamics.health.strengths.map((s: string, i: number) => (
                                    <li key={i} className="text-xs text-white/70 flex items-start gap-1.5">
                                      <span className="text-emerald-400 mt-0.5">•</span>{s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {dynamics.health?.concerns?.length > 0 && (
                              <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-950/10">
                                <p className="text-[10px] font-semibold text-orange-400/70 uppercase tracking-wider mb-1.5">Concerns</p>
                                <ul className="space-y-1">
                                  {dynamics.health.concerns.map((c: string, i: number) => (
                                    <li key={i} className="text-xs text-white/70 flex items-start gap-1.5">
                                      <span className="text-orange-400 mt-0.5">•</span>{c}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Common topics */}
                        {dynamics.common_topics?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-white/35 mb-1.5">Topics you discuss together</p>
                            <div className="flex flex-wrap gap-1.5">
                              {dynamics.common_topics.map((t: string) => (
                                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/50 bg-white/5">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!influenceProfile && !dynamics && (
                      <div className="text-center py-12 text-white/30">
                        <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium mb-1">No intelligence data yet</p>
                        <p className="text-xs max-w-xs mx-auto">
                          Keep journaling about {editedCharacter.name.split(' ')[0]} — LoreBook builds relationship intelligence from your entries over time.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── What LoreBook Knows ── */}
            {!loadingDetails && activeTab === 'knowledge' && (
              <div className="space-y-6">
                {/* ── Character Facts (from conversations) ── */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-violet-400" />
                      Facts From Conversations
                    </h3>
                    <p className="text-xs text-white/45">
                      Extracted directly from chats — updated as new information comes in.
                    </p>
                  </div>

                  {factsLoading && (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {!factsLoading && characterFacts.length === 0 && (
                    <div className="text-center py-8 text-white/30">
                      <p className="text-xs">Chat about {editedCharacter.name.split(' ')[0]} to start building their profile.</p>
                    </div>
                  )}

                  {!factsLoading && characterFacts.length > 0 && (
                    <div className="space-y-4">
                      {Object.entries(
                        characterFacts.reduce((acc: Record<string, any[]>, f: any) => {
                          if (!acc[f.category]) acc[f.category] = [];
                          acc[f.category].push(f);
                          return acc;
                        }, {})
                      ).map(([category, facts]) => {
                        const catLabel: Record<string, string> = {
                          personality: 'Personality', appearance: 'Appearance',
                          relationship: 'Relationship', history: 'History',
                          career: 'Career', location: 'Location', goals: 'Goals', general: 'General',
                        };
                        const statusBadge: Record<string, { label: string; cls: string }> = {
                          updated:      { label: 'Updated',      cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                          corrected:    { label: 'Corrected',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                          contradicted: { label: 'Contradicted', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
                        };
                        return (
                          <div key={category}>
                            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                              {catLabel[category] ?? category}
                            </p>
                            <div className="space-y-2">
                              {(facts as any[]).map((fact: any) => {
                                const pct = Math.round((fact.confidence ?? 0.7) * 100);
                                const badge = statusBadge[fact.status as string];
                                return (
                                  <div key={fact.id} className="flex items-start gap-2.5 p-3 rounded-lg border border-white/6 bg-white/3">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-white/85 leading-snug">{fact.fact}</p>
                                      {fact.previous_value && (
                                        <p className="text-[11px] text-white/35 mt-1 line-through">{fact.previous_value}</p>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                      {badge && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${badge.cls}`}>
                                          {badge.label}
                                        </span>
                                      )}
                                      <span className={`text-[10px] tabular-nums font-semibold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                        {pct}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Crystallized Knowledge ── */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-indigo-400" />
                      Crystallized Knowledge
                    </h3>
                    <p className="text-xs text-white/45">
                      Patterns crystallized from your entries, arcs, and interactions.
                    </p>
                  </div>

                {knowledgeLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!knowledgeLoading && knowledgeClaims.length === 0 && (
                  <div className="text-center py-12 text-white/35">
                    <Brain className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium mb-1">No knowledge claims yet</p>
                    <p className="text-xs max-w-xs mx-auto">
                      As you journal about {editedCharacter.name.split(' ')[0]}, LoreBook will crystallize
                      patterns into verified knowledge claims that appear here.
                    </p>
                  </div>
                )}

                {!knowledgeLoading && knowledgeClaims.length > 0 && (
                  <div className="space-y-3">
                    {knowledgeClaims.map((claim: any) => {
                      const pct = Math.round((claim.confidence ?? 0) * 100);
                      const confColor = pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-orange-400';
                      const evidenceCount = claim.evidence_count ?? claim.evidence_links?.length ?? 0;

                      return (
                        <div key={claim.id} className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/15 space-y-3">
                          {/* Claim text */}
                          <p className="text-sm text-white/90 leading-relaxed">
                            {claim.human_readable_claim}
                          </p>

                          {/* Confidence + evidence row */}
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-xs font-semibold tabular-nums ${confColor}`}>{pct}%</span>
                              <span className="text-xs text-white/30">confidence</span>
                            </div>
                            {evidenceCount > 0 && (
                              <span className="text-xs text-white/35">
                                {evidenceCount} evidence item{evidenceCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {claim.knowledge_type && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/25 text-indigo-300/70 bg-indigo-950/30">
                                {claim.knowledge_type.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>

                          {/* Evidence summaries */}
                          {claim.evidence_links?.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-white/8">
                              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Supporting evidence</p>
                              {(claim.evidence_links as any[]).slice(0, 3).map((link: any, i: number) => (
                                <div key={i} className="flex items-start gap-2">
                                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-400/40 flex-shrink-0 mt-1.5" />
                                  <p className="text-xs text-white/55 leading-snug">{link.evidence_summary}</p>
                                </div>
                              ))}
                              {claim.evidence_links.length > 3 && (
                                <p className="text-[10px] text-white/25 pl-3.5">
                                  +{claim.evidence_links.length - 3} more evidence items
                                </p>
                              )}
                            </div>
                          )}

                          {/* Last reinforced */}
                          {claim.last_reinforced_at && (
                            <p className="text-[10px] text-white/25">
                              Last reinforced {new Date(claim.last_reinforced_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>

                {/* ── Recurring Moments ── */}
                {sceneCandidates.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                        <span className="h-4 w-4 text-amber-400">⟳</span>
                        Recurring Moments
                      </h3>
                      <p className="text-xs text-white/45">
                        Patterns LoreBook has noticed across multiple conversations.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {sceneCandidates.map((c: any) => {
                        const strength = Math.round((c.continuity_strength ?? 0) * 100);
                        return (
                          <div key={c.id} className="p-3 rounded-lg border border-amber-500/15 bg-amber-500/5 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-white/85 leading-snug font-medium">
                                {c.canonical_title ?? c.recurring_activities?.[0] ?? 'Recurring moment'}
                              </p>
                              <span className={`text-[10px] tabular-nums font-semibold flex-shrink-0 ${strength >= 80 ? 'text-green-400' : strength >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                {strength}%
                              </span>
                            </div>
                            {c.recurring_activities?.length > 0 && (
                              <p className="text-xs text-white/45 leading-snug">
                                {c.recurring_activities.slice(0, 3).join(' · ')}
                              </p>
                            )}
                            <p className="text-[10px] text-white/25">
                              Seen {c.occurrence_count ?? 1}× · last {c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString() : 'recently'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loadingDetails && activeTab === 'metadata' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Character Details</h3>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/60">Character ID:</span>
                          <span className="text-white font-mono text-xs">{editedCharacter.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Name:</span>
                          <span className="text-white">{editedCharacter.name}</span>
                        </div>
                        {editedCharacter.alias && editedCharacter.alias.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Aliases:</span>
                            <span className="text-white">{editedCharacter.alias.join(', ')}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-white/60">Pronouns:</span>
                          <span className="text-white">{editedCharacter.pronouns || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Role:</span>
                          <span className="text-white">{editedCharacter.role || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Archetype:</span>
                          <span className="text-white">{editedCharacter.archetype || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Status:</span>
                          <span className="text-white capitalize">{editedCharacter.status || 'Unknown'}</span>
                        </div>
                        {editedCharacter.first_appearance && (
                          <div className="flex justify-between">
                            <span className="text-white/60">First Appearance:</span>
                            <span className="text-white">{editedCharacter.first_appearance}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-white/60">Tags Count:</span>
                          <span className="text-white">{editedCharacter.tags?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Shared Memories:</span>
                          <span className="text-white">{editedCharacter.shared_memories?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Relationships:</span>
                          <span className="text-white">{editedCharacter.relationships?.length || 0}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {editedCharacter.metadata && Object.keys(editedCharacter.metadata).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Raw Metadata</h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <pre className="text-xs text-white/80 overflow-x-auto">
                          {JSON.stringify(editedCharacter.metadata, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/25 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-white">Delete {editedCharacter.name}?</h3>
                <p className="text-sm text-white/60 mt-1">
                  This removes the character card, facts, relationships, and memory links. Events stay, but this action cannot be undone.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void deleteCharacter()}
                disabled={deleteBusy}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/30"
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                {deleteBusy ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = sharedMemoryCards.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={sharedMemoryCards}
        />
      )}
      {/* Organization Detail Modal */}
      {selectedOrganization && (
        <OrganizationDetailModal
          organization={selectedOrganization}
          onClose={() => setSelectedOrganization(null)}
          onUpdate={() => {
            // Refresh if needed
          }}
        />
      )}

      {/* Character Detail Modal (for nested characters) */}
      {selectedCharacterForModal && (
        <CharacterDetailModal
          character={selectedCharacterForModal}
          onClose={() => setSelectedCharacterForModal(null)}
          onUpdate={() => {
            // Refresh if needed
          }}
        />
      )}

      {/* Location Detail Modal */}
      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}

      {/* Perception Detail Modal */}
      {selectedPerception && (
        <PerceptionDetailModal
          perception={selectedPerception}
          onClose={() => setSelectedPerception(null)}
          onUpdate={(updated) => {
            setSelectedPerception(updated);
          }}
        />
      )}
    </div>
  );
};
