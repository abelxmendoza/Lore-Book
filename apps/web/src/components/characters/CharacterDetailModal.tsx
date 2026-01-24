import { useState, useEffect, useRef } from 'react';
import { PerceptionsView } from '../perceptions/PerceptionsView';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, TrendingUp, TrendingDown, Minus, Heart, Star, Zap, BarChart3, Lightbulb, Award, User, Hash, Info, Link2, Eye, Building2, UserCircle, TreePine, AlertCircle, AlertTriangle, Briefcase, DollarSign, Activity, Smile, Heart as HeartIcon, Home } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { CharacterRelationshipTimeline } from './CharacterRelationshipTimeline';
import { RelationshipTreeView } from '../relationshipTree/RelationshipTreeView';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage, type Message } from '../../features/chat/message/ChatMessage';
import { OrganizationDetailModal } from '../organizations/OrganizationDetailModal';
import type { Organization } from '../organizations/OrganizationProfileCard';
import { LocationDetailModal, type LocationProfile } from '../locations/LocationDetailModal';
import { PerceptionDetailModal } from '../perceptions/PerceptionDetailModal';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { Character } from './CharacterProfileCard';
import { CharacterAvatar } from './CharacterAvatar';
import { useMockData } from '../../contexts/MockDataContext';
import type { PerceptionEntry } from '../../types/perception';

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

type TabKey = 'info' | 'social' | 'relationships' | 'perceptions' | 'history' | 'relationship_timeline' | 'chat' | 'insights' | 'metadata';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Info', icon: FileText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'social', label: 'Social Media', icon: Globe },
  { key: 'relationships', label: 'Connections', icon: Network },
  { key: 'perceptions', label: 'Perceptions', icon: Eye },
  { key: 'history', label: 'History', icon: Calendar },
  { key: 'relationship_timeline', label: 'Relationship Timeline', icon: Heart },
  { key: 'insights', label: 'Insights', icon: Brain },
  { key: 'metadata', label: 'Metadata', icon: Database }
];

export const CharacterDetailModal = ({ character, onClose, onUpdate, relationship }: CharacterDetailModalProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [editedCharacter, setEditedCharacter] = useState<CharacterDetail>(character as CharacterDetail);

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

  const getImportanceTooltip = (level?: string | null, score?: number | null) => {
    const scoreText = score !== null && score !== undefined ? ` (Score: ${Math.round(score)}/100)` : '';
    switch (level) {
      case 'protagonist':
        return `Protagonist${scoreText}: This character is central to your story. They appear frequently, have deep relationships with you, and significantly impact your narrative. Assigned based on mention frequency, relationship depth, and emotional significance.`;
      case 'major':
        return `Major${scoreText}: This character plays an important role in your story. They appear regularly and have meaningful connections. Assigned based on consistent mentions and relationship significance.`;
      case 'supporting':
        return `Supporting${scoreText}: This character appears occasionally and contributes to your story. They have moderate significance. Assigned based on periodic mentions and moderate relationship depth.`;
      case 'minor':
        return `Minor${scoreText}: This character appears infrequently or has limited impact on your narrative. Assigned based on rare mentions or shallow relationship depth.`;
      case 'background':
        return `Background${scoreText}: This character is mentioned but has minimal impact on your story. They're part of the background context. Assigned based on very rare mentions or third-party references.`;
      default:
        return `Importance Level${scoreText}: Automatically calculated based on how often you mention this character, the depth of your relationship, and their role in your story.`;
    }
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
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  const [selectedPerception, setSelectedPerception] = useState<PerceptionEntry | null>(null);
  const [selectedCharacterForModal, setSelectedCharacterForModal] = useState<Character | null>(null);
  const [characterAttributes, setCharacterAttributes] = useState<Array<{
    attributeType: string;
    attributeValue: string;
    confidence: number;
    isCurrent: boolean;
    evidence?: string;
    startTime?: string;
    endTime?: string;
  }>>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);

  // Generate mock organization data
  const getMockOrganizations = (): Organization[] => {
    return [
      {
        id: '1',
        name: 'Tech Startup Community',
        aliases: [],
        type: 'friend_group',
        description: 'Professional network of tech entrepreneurs and startup founders',
        status: 'active',
        member_count: 5,
        usage_count: 12,
        confidence: 0.9,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        members: [
          { id: '1', character_name: editedCharacter.name, role: 'Member', status: 'active' },
          { id: '2', character_name: 'Sarah Chen', role: 'Founder', status: 'active' },
          { id: '3', character_name: 'Marcus Johnson', role: 'Member', status: 'active' },
          { id: '4', character_name: 'Emily Rodriguez', role: 'Organizer', status: 'active' },
          { id: '5', character_name: 'David Kim', role: 'Member', status: 'active' },
        ]
      },
      {
        id: '2',
        name: 'Local Book Club',
        aliases: [],
        type: 'club',
        description: 'Monthly book discussion group',
        status: 'active',
        member_count: 4,
        usage_count: 8,
        confidence: 0.85,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        members: [
          { id: '1', character_name: editedCharacter.name, role: 'Member', status: 'active' },
          { id: '2', character_name: 'Alex Thompson', role: 'Coordinator', status: 'active' },
          { id: '3', character_name: 'Jessica Martinez', role: 'Member', status: 'active' },
          { id: '4', character_name: 'Ryan O\'Connor', role: 'Member', status: 'active' },
        ]
      },
      {
        id: '3',
        name: 'University Alumni Association',
        aliases: [],
        type: 'affiliation',
        description: 'Educational organization for university graduates',
        status: 'active',
        member_count: 6,
        usage_count: 5,
        confidence: 0.75,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        members: [
          { id: '1', character_name: editedCharacter.name, role: 'Alumnus', status: 'active' },
          { id: '2', character_name: 'Michael Brown', role: 'President', status: 'active' },
          { id: '3', character_name: 'Lisa Anderson', role: 'Secretary', status: 'active' },
          { id: '4', character_name: 'James Wilson', role: 'Member', status: 'active' },
          { id: '5', character_name: 'Amanda Lee', role: 'Treasurer', status: 'active' },
          { id: '6', character_name: 'Chris Taylor', role: 'Member', status: 'active' },
        ]
      },
      {
        id: '4',
        name: 'Yoga Studio Members',
        aliases: [],
        type: 'club',
        description: 'Fitness community at local yoga studio',
        status: 'active',
        member_count: 4,
        usage_count: 3,
        confidence: 0.7,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        members: [
          { id: '1', character_name: editedCharacter.name, role: 'Member', status: 'active' },
          { id: '2', character_name: 'Maya Patel', role: 'Instructor', status: 'active' },
          { id: '3', character_name: 'Tom Harris', role: 'Member', status: 'active' },
          { id: '4', character_name: 'Sophie Green', role: 'Member', status: 'active' },
        ]
      }
    ];
  };

  // Create mock shared memories for display
  const createMockMemories = (characterName: string): MemoryCard[] => {
    const now = new Date();
    return [
      {
        id: `mock-memory-1-${characterName}`,
        title: `Coffee catch-up with ${characterName}`,
        content: `Had a great coffee catch-up with ${characterName} today. We talked about our recent projects and shared some laughs. It's always refreshing to spend time with them.`,
        date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['friendship', 'coffee', 'conversation'],
        mood: 'happy',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      },
      {
        id: `mock-memory-2-${characterName}`,
        title: `${characterName} helped me with my project`,
        content: `${characterName} gave me some really valuable feedback on my project. Their perspective is always insightful and they have a way of asking the right questions that help me think deeper.`,
        date: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['collaboration', 'support', 'feedback'],
        mood: 'grateful',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      },
      {
        id: `mock-memory-3-${characterName}`,
        title: `Birthday celebration for ${characterName}`,
        content: `Celebrated ${characterName}'s birthday today! We went to their favorite restaurant and had an amazing time. They seemed really happy and it was wonderful to be part of their special day.`,
        date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['celebration', 'birthday', 'friendship'],
        mood: 'joyful',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      },
      {
        id: `mock-memory-4-${characterName}`,
        title: `Deep conversation with ${characterName}`,
        content: `Had one of those deep, meaningful conversations with ${characterName} that I always treasure. We talked about life, dreams, and what we're working towards. Their wisdom always inspires me.`,
        date: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['deep-talk', 'philosophy', 'friendship'],
        mood: 'reflective',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      }
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
        
        // Generate mock relationship and proximity data if missing
        const mockRelationshipData = generateMockRelationshipData(response);
        const characterWithMockData = {
          ...response,
          ...mockRelationshipData
        };
        
        setEditedCharacter(characterWithMockData);
        
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
        // On error, generate mock data for the character
        const mockRelationshipData = generateMockRelationshipData(character as CharacterDetail);
        const characterWithMockData = {
          ...character,
          ...mockRelationshipData
        } as CharacterDetail;
        setEditedCharacter(characterWithMockData);
        
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
    const mockAttributes = [
      // Employment & Financial
      {
        attributeType: 'employment_status',
        attributeValue: 'Employed',
        confidence: 0.85,
        isCurrent: true,
        evidence: `Mentioned working at a tech company in recent conversations about ${characterName}`,
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        attributeType: 'occupation',
        attributeValue: 'Software Engineer',
        confidence: 0.90,
        isCurrent: true,
        evidence: `Described as a software engineer working on web applications`,
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        attributeType: 'workplace',
        attributeValue: 'Tech Startup Inc.',
        confidence: 0.75,
        isCurrent: true,
        evidence: `Mentioned working at a startup company`,
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        attributeType: 'financial_status',
        attributeValue: 'Stable',
        confidence: 0.70,
        isCurrent: true,
        evidence: `Seems financially stable based on lifestyle and spending patterns`,
      },
      // Lifestyle Patterns
      {
        attributeType: 'lifestyle_pattern',
        attributeValue: 'Active Social Life',
        confidence: 0.80,
        isCurrent: true,
        evidence: `Frequently mentioned going out, attending events, and socializing`,
      },
      {
        attributeType: 'lifestyle_pattern',
        attributeValue: 'Fitness Enthusiast',
        confidence: 0.75,
        isCurrent: true,
        evidence: `Regularly goes to the gym and talks about fitness goals`,
      },
      {
        attributeType: 'lifestyle_pattern',
        attributeValue: 'Night Owl',
        confidence: 0.65,
        isCurrent: true,
        evidence: `Often active late at night and prefers evening activities`,
      },
      // Personality Traits
      {
        attributeType: 'personality_trait',
        attributeValue: 'Outgoing',
        confidence: 0.85,
        isCurrent: true,
        evidence: `Described as friendly, sociable, and easy to talk to`,
      },
      {
        attributeType: 'personality_trait',
        attributeValue: 'Ambitious',
        confidence: 0.80,
        isCurrent: true,
        evidence: `Shows drive and motivation in career and personal goals`,
      },
      {
        attributeType: 'personality_trait',
        attributeValue: 'Supportive',
        confidence: 0.75,
        isCurrent: true,
        evidence: `Often provides encouragement and help to others`,
      },
      // Relationship & Living
      {
        attributeType: 'relationship_status',
        attributeValue: 'Single',
        confidence: 0.70,
        isCurrent: true,
        evidence: `Not currently in a relationship based on recent conversations`,
      },
      {
        attributeType: 'living_situation',
        attributeValue: 'Renting Apartment',
        confidence: 0.75,
        isCurrent: true,
        evidence: `Mentioned living in an apartment in the city`,
      },
    ];
    return mockAttributes;
  };

  // Load character attributes
  useEffect(() => {
    const loadAttributes = async () => {
      setLoadingAttributes(true);
      try {
        const response = await fetchJson<{ attributes: Array<{
          attributeType: string;
          attributeValue: string;
          confidence: number;
          isCurrent: boolean;
          evidence?: string;
          startTime?: string;
          endTime?: string;
        }> }>(`/api/characters/${character.id}/attributes?currentOnly=true`);
        const realAttributes = response.attributes || [];
        // If no real attributes, use mock data
        if (realAttributes.length === 0) {
          const mockAttributes = generateMockAttributes(character.name);
          setCharacterAttributes(mockAttributes);
        } else {
          setCharacterAttributes(realAttributes);
        }
      } catch (error) {
        console.error('Failed to load character attributes:', error);
        // On error, use mock data
        const mockAttributes = generateMockAttributes(character.name);
        setCharacterAttributes(mockAttributes);
      } finally {
        setLoadingAttributes(false);
      }
    };
    void loadAttributes();
  }, [character.id, character.name]);

  // Load insights when Insights tab is active and ensure analytics exist
  useEffect(() => {
    if (activeTab === 'insights') {
      // If no analytics exist, generate mock analytics and store in character state
      if (!editedCharacter.analytics) {
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

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatLoading(true);

    try {
      // Build comprehensive character context with analytics (use mock if not available)
      const analytics = editedCharacter.analytics || generateMockAnalytics(editedCharacter);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm" data-testid="character-modal" role="dialog" aria-modal="true">
      <div className="bg-gradient-to-br from-black via-black/95 to-black border-0 sm:border-2 border-primary/30 rounded-none sm:rounded-2xl w-full h-full sm:h-[95vh] sm:max-w-5xl overflow-hidden flex flex-col shadow-2xl shadow-primary/20">
        {/* Enhanced Header */}
        <div className="relative bg-gradient-to-r from-primary/20 via-purple-900/20 to-primary/20 border-b-2 border-primary/30 p-3 sm:p-6">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <CharacterAvatar 
                  url={editedCharacter.avatar_url} 
                  name={editedCharacter.name} 
                  size={48}
                  className="sm:w-16 sm:h-16"
                />
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
                    <Tooltip content={getImportanceTooltip(editedCharacter.importance_level, editedCharacter.importance_score)}>
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
              </div>
            </div>
            <Button variant="ghost" onClick={onClose} className="flex-shrink-0 hover:bg-white/10 h-8 w-8 sm:h-10 sm:w-10 p-0">
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
                {/* Read-Only Notice */}
                <Card className="bg-gradient-to-r from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg shadow-blue-500/10">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/40">
                        <Info className="h-6 w-6 text-blue-300 flex-shrink-0" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-bold text-blue-200 mb-2">Character Information is Read-Only</p>
                        <p className="text-sm text-blue-100/90 leading-relaxed">
                          Character information is automatically updated through conversations. To update this character's information, use the Chat tab to tell the system about them.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

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

                {/* Summary Section - Prominent */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/20 border border-primary/40">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Summary</h2>
                  </div>
                  <Card className="bg-gradient-to-br from-black/80 via-black/60 to-black/80 border-2 border-primary/30 shadow-xl">
                    <CardContent className="p-6">
                      <div className="text-white text-lg leading-relaxed min-h-[120px]">
                        {editedCharacter.summary ? (
                          <p className="whitespace-pre-wrap">{editedCharacter.summary}</p>
                        ) : (
                          <span className="text-white/50 italic text-base">No summary available yet. Information will appear here as you talk about this character.</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Character Attributes Section - Moved up for prominence */}
                <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/40">
                        <UserCircle className="h-5 w-5 text-blue-300" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Detected Attributes</h3>
                  </div>
                  
                    {loadingAttributes ? (
                      <div className="text-center py-8 text-white/60">
                        <Clock className="h-6 w-6 mx-auto mb-2 animate-spin" />
                        <p>Loading attributes...</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Employment & Financial */}
                        {(characterAttributes.some(a => a.attributeType === 'employment_status' || a.attributeType === 'occupation' || a.attributeType === 'workplace' || a.attributeType === 'financial_status')) && (
                    <div>
                            <div className="flex items-center gap-2 mb-4">
                              <Briefcase className="h-4 w-4 text-blue-300" />
                              <h4 className="text-sm font-bold text-white/90 uppercase tracking-wide">Employment & Financial</h4>
                    </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {characterAttributes
                                .filter(a => ['employment_status', 'occupation', 'workplace', 'financial_status'].includes(a.attributeType))
                                .map((attr, idx) => (
                                  <div key={idx} className="bg-black/60 border border-blue-500/30 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                                        {attr.attributeType === 'employment_status' ? 'Employment' :
                                         attr.attributeType === 'occupation' ? 'Occupation' :
                                         attr.attributeType === 'workplace' ? 'Workplace' :
                                         'Financial Status'}
                                      </span>
                                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 border-blue-500/40">
                                        {Math.round(attr.confidence * 100)}%
                                      </Badge>
                                    </div>
                                    <p className="text-sm font-medium text-white">{attr.attributeValue}</p>
                                    {attr.evidence && (
                                      <p className="text-xs text-white/60 mt-1 italic">"{attr.evidence.substring(0, 80)}..."</p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Lifestyle Patterns */}
                        {characterAttributes.some(a => a.attributeType === 'lifestyle_pattern') && (
                    <div>
                            <div className="flex items-center gap-2 mb-4">
                              <Activity className="h-4 w-4 text-blue-300" />
                              <h4 className="text-sm font-bold text-white/90 uppercase tracking-wide">Lifestyle Patterns</h4>
                    </div>
                            <div className="flex flex-wrap gap-3">
                              {characterAttributes
                                .filter(a => a.attributeType === 'lifestyle_pattern')
                                .map((attr, idx) => (
                                  <Tooltip key={idx} content={attr.evidence ? `Evidence: ${attr.evidence}` : `Confidence: ${Math.round(attr.confidence * 100)}%`}>
                                    <Badge variant="outline" className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-300 border-blue-500/50 font-semibold shadow-md cursor-help">
                                      {attr.attributeValue}
                                      <span className="ml-2 text-[10px] opacity-70">({Math.round(attr.confidence * 100)}%)</span>
                                    </Badge>
                                  </Tooltip>
                                ))}
                  </div>
                          </div>
                        )}

                        {/* Personality Traits */}
                        {characterAttributes.some(a => a.attributeType === 'personality_trait') && (
                  <div>
                            <div className="flex items-center gap-2 mb-4">
                              <Smile className="h-4 w-4 text-blue-300" />
                              <h4 className="text-sm font-bold text-white/90 uppercase tracking-wide">Personality Traits</h4>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              {characterAttributes
                                .filter(a => a.attributeType === 'personality_trait')
                                .map((attr, idx) => (
                                  <Tooltip key={idx} content={attr.evidence ? `Evidence: ${attr.evidence}` : `Confidence: ${Math.round(attr.confidence * 100)}%`}>
                                    <Badge variant="outline" className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-300 border-blue-500/50 font-semibold shadow-md cursor-help">
                                      {attr.attributeValue}
                                    </Badge>
                                  </Tooltip>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Health Conditions */}
                        {characterAttributes.some(a => a.attributeType === 'health_condition') && (
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <AlertCircle className="h-4 w-4 text-blue-300" />
                              <h4 className="text-sm font-bold text-white/90 uppercase tracking-wide">Health Conditions</h4>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              {characterAttributes
                                .filter(a => a.attributeType === 'health_condition')
                                .map((attr, idx) => (
                                  <Tooltip key={idx} content={attr.evidence ? `Evidence: ${attr.evidence}` : `Confidence: ${Math.round(attr.confidence * 100)}%`}>
                                    <Badge variant="outline" className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-300 border-blue-500/50 font-semibold shadow-md cursor-help">
                                      {attr.attributeValue}
                                    </Badge>
                                  </Tooltip>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Relationship & Living Situation */}
                        {(characterAttributes.some(a => a.attributeType === 'relationship_status' || a.attributeType === 'living_situation')) && (
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <HeartIcon className="h-4 w-4 text-blue-300" />
                              <h4 className="text-sm font-bold text-white/90 uppercase tracking-wide">Relationship & Living</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {characterAttributes
                                .filter(a => ['relationship_status', 'living_situation'].includes(a.attributeType))
                                .map((attr, idx) => (
                                  <div key={idx} className="bg-black/60 border border-blue-500/30 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                                        {attr.attributeType === 'relationship_status' ? 'Relationship' : 'Living Situation'}
                                      </span>
                                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 border-blue-500/40">
                                        {Math.round(attr.confidence * 100)}%
                                      </Badge>
                                    </div>
                                    <p className="text-sm font-medium text-white">{attr.attributeValue}</p>
                                    {attr.evidence && (
                                      <p className="text-xs text-white/60 mt-1 italic">"{attr.evidence.substring(0, 80)}..."</p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Other Attributes */}
                        {characterAttributes.some(a => !['employment_status', 'occupation', 'workplace', 'financial_status', 'lifestyle_pattern', 'personality_trait', 'health_condition', 'relationship_status', 'living_situation'].includes(a.attributeType)) && (
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <Tag className="h-4 w-4 text-blue-300" />
                              <h4 className="text-sm font-bold text-white/90 uppercase tracking-wide">Other Attributes</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {characterAttributes
                                .filter(a => !['employment_status', 'occupation', 'workplace', 'financial_status', 'lifestyle_pattern', 'personality_trait', 'health_condition', 'relationship_status', 'living_situation'].includes(a.attributeType))
                                .map((attr, idx) => (
                                  <div key={idx} className="bg-black/60 border border-blue-500/30 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                                        {attr.attributeType.replace(/_/g, ' ')}
                                      </span>
                                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 border-blue-500/40">
                                        {Math.round(attr.confidence * 100)}%
                                      </Badge>
                                    </div>
                                    <p className="text-sm font-medium text-white">{attr.attributeValue}</p>
                                    {attr.evidence && (
                                      <p className="text-xs text-white/60 mt-1 italic">"{attr.evidence.substring(0, 80)}..."</p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

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
                            <Tooltip content={getImportanceTooltip(editedCharacter.importance_level, editedCharacter.importance_score)}>
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
                      <div className="bg-black/40 rounded-lg p-3 border border-purple-500/20">
                        <p className="text-sm text-white/80 flex items-start gap-2 leading-relaxed">
                          <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-purple-300" />
                      <span>Importance is automatically calculated based on mentions, relationships, role significance, and interaction frequency. This helps identify major vs. minor characters in your story.</span>
                    </p>
                  </div>
                    </CardContent>
                  </Card>
                )}

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
                            <span className="text-white/40 italic text-base">Not specified</span>
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
                            <span className="text-white/40 italic text-base">Not specified</span>
                          )}
                        </div>
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="flex items-center gap-4 bg-black/40 rounded-lg p-4 border border-orange-500/30">
                        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center shadow-md ${
                          editedCharacter.has_met ? 'bg-green-500 border-green-400' : 'bg-black/60 border-border/50'
                        }`}>
                          {editedCharacter.has_met && <span className="text-white text-sm font-bold">✓</span>}
                        </div>
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
                            <span className="text-white/40 italic text-base">Not specified</span>
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
                        {editedCharacter.pronouns || <span className="text-white/40 italic text-base">Not specified</span>}
                  </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-pink-500/20 via-pink-600/15 to-pink-500/20 border-2 border-pink-500/40 shadow-lg">
                    <CardContent className="p-5">
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Archetype</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-inner">
                        {editedCharacter.archetype || <span className="text-white/40 italic text-base">Not specified</span>}
                  </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-cyan-500/20 via-cyan-600/15 to-cyan-500/20 border-2 border-cyan-500/40 shadow-lg">
                    <CardContent className="p-5">
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Role</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-inner">
                        {editedCharacter.role || <span className="text-white/40 italic text-base">Not specified</span>}
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
                      <RelationshipTreeView 
                        entityId={editedCharacter.id} 
                        entityType="character"
                        defaultCategory="family"
                      />
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
                            onClick={async () => {
                              try {
                                // Try to fetch character by name or ID
                                const char = await fetchJson<Character>(`/api/characters/search?name=${encodeURIComponent(rel.character_name || '')}`);
                                if (char) {
                                  setSelectedCharacterForModal(char);
                                }
                              } catch (error) {
                                // If fetch fails, create a minimal character object
                                setSelectedCharacterForModal({
                                  id: rel.character_id || `temp-${rel.character_name}`,
                                  name: rel.character_name || 'Unknown',
                                } as Character);
                              }
                            }}
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
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Groups & Organizations
                  </h3>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-4">
                        {/* Shared Groups */}
                        <div>
                          <h4 className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                            <Users className="h-4 w-4 text-green-400" />
                            Shared Groups (You're both in)
                          </h4>
                          <div className="space-y-2">
                            {getMockOrganizations().filter(org => org.id === '1' || org.id === '2').map((org) => (
                              <div
                                key={org.id}
                                onClick={() => setSelectedOrganization(org)}
                                className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 cursor-pointer hover:bg-green-500/20 hover:border-green-500/50 transition-all"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-white">{org.name}</p>
                                    <p className="text-xs text-white/60 mt-1">{org.description || 'Group'}</p>
                                  </div>
                                  <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">
                                    Shared
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Their Groups (Not Shared) */}
                        <div>
                          <h4 className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-orange-400" />
                            Their Groups (You're not in)
                          </h4>
                          <div className="space-y-2">
                            {getMockOrganizations().filter(org => org.id === '3' || org.id === '4').map((org) => (
                              <div
                                key={org.id}
                                onClick={() => setSelectedOrganization(org)}
                                className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 cursor-pointer hover:bg-orange-500/20 hover:border-orange-500/50 transition-all"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-white">{org.name}</p>
                                    <p className="text-xs text-white/60 mt-1">{org.description || 'Group'}</p>
                                  </div>
                                  <Tooltip content={getNotSharedBadgeTooltip()}>
                                    <Badge variant="outline" className="bg-orange-500/20 text-orange-300 border-orange-500/30 cursor-help">
                                      Not Shared
                                    </Badge>
                                  </Tooltip>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

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
              <div className="space-y-6">
                <PerceptionsView
                  personId={editedCharacter.id}
                  personName={editedCharacter.name}
                  showCreateButton={true}
                />
              </div>
            )}

            {!loadingDetails && activeTab === 'history' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Shared Memories
                    </h3>
                    <p className="text-sm text-white/60 mt-1">
                      Stories and moments you've shared with {editedCharacter.name}
                    </p>
                  </div>
                  {editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 && (
                    <span className="text-sm text-white/50">
                      {editedCharacter.shared_memories.length} {editedCharacter.shared_memories.length === 1 ? 'memory' : 'memories'}
                    </span>
                  )}
                </div>

                {/* Memory Cards */}
                {loadingMemories ? (
                  <div className="text-center py-12 text-white/60">
                    <p>Loading shared memories...</p>
                  </div>
                ) : sharedMemoryCards.length > 0 ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {sharedMemoryCards.map((memory) => (
                        <div key={memory.id} data-memory-id={memory.id}>
                          <MemoryCardComponent
                            memory={memory}
                            showLinked={true}
                            expanded={expandedCardId === memory.id}
                            onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                            onSelect={() => setSelectedMemory(memory)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 ? (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">Loading memory details...</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">No shared memories yet</p>
                    <p className="text-sm">Memories will appear here as you mention {editedCharacter.name} in your journal entries</p>
                  </div>
                )}
              </div>
            )}

            {/* Chat Tab */}
            {/* Relationship Timeline Tab */}
            {!loadingDetails && activeTab === 'relationship_timeline' && (
              <div className="space-y-6">
                <CharacterRelationshipTimeline characterId={editedCharacter.id} />
                          </div>
                        )}

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
              </div>
            )}

            {/* Insights Tab - Analytics Dashboard */}
            {!loadingDetails && activeTab === 'insights' && (
              <div className="space-y-8">
                {(() => {
                  const analytics = editedCharacter.analytics || generateMockAnalytics(editedCharacter);
                  return analytics ? (
                  <>
                    {/* Analytics Dashboard Header */}
                    <Card className="bg-gradient-to-br from-purple-500/20 via-purple-600/15 to-purple-500/20 border-2 border-purple-500/40 shadow-xl">
                      <CardHeader className="pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/40">
                            <TrendingUp className="h-6 w-6 text-purple-300" />
                          </div>
                          <h3 className="text-2xl font-bold text-white">Relationship Analytics & Insights</h3>
                        </div>
                        <p className="text-sm text-white/70 mt-2">
                          Comprehensive analysis of your relationship with {editedCharacter.name}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-8">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <Tooltip content={getClosenessScoreTooltip(analytics.closeness_score, editedCharacter)}>
                            <Card className="bg-gradient-to-br from-pink-500/20 via-pink-600/15 to-pink-500/20 border-2 border-pink-500/40 shadow-lg cursor-help hover:border-pink-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Closeness</div>
                                <div className="text-4xl font-bold text-pink-300 mb-1">{analytics.closeness_score}%</div>
                                <div className="text-xs text-white/60 mt-2">relationship depth</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getImportanceScoreTooltip(analytics.importance_score, editedCharacter)}>
                            <Card className="bg-gradient-to-br from-amber-500/20 via-amber-600/15 to-amber-500/20 border-2 border-amber-500/40 shadow-lg cursor-help hover:border-amber-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Importance</div>
                                <div className="text-4xl font-bold text-amber-300 mb-1">{analytics.importance_score}%</div>
                                <div className="text-xs text-white/60 mt-2">to you</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getPriorityScoreTooltip(analytics.priority_score, editedCharacter)}>
                            <Card className="bg-gradient-to-br from-green-500/20 via-green-600/15 to-green-500/20 border-2 border-green-500/40 shadow-lg cursor-help hover:border-green-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Priority</div>
                                <div className="text-4xl font-bold text-green-300 mb-1">{analytics.priority_score}%</div>
                                <div className="text-xs text-white/60 mt-2">urgency level</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getEngagementScoreTooltip(analytics.engagement_score, editedCharacter)}>
                            <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg cursor-help hover:border-blue-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Engagement</div>
                                <div className="text-4xl font-bold text-blue-300 mb-1">{analytics.engagement_score}%</div>
                                <div className="text-xs text-white/60 mt-2">interaction level</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                        </div>

                        {/* Relationship Depth & Frequency */}
                        <div className="grid grid-cols-2 gap-6">
                          <Tooltip content={getAnalyticsRelationshipDepthTooltip(analytics.relationship_depth, analytics.shared_experiences)}>
                            <Card className="bg-gradient-to-br from-purple-500/20 via-purple-600/15 to-purple-500/20 border-2 border-purple-500/40 shadow-lg cursor-help hover:border-purple-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-sm font-bold text-white/80 mb-3 uppercase tracking-wide">Relationship Depth</div>
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex-1 h-3 bg-black/60 rounded-full overflow-hidden shadow-inner">
                                    <div 
                                      className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all shadow-lg"
                                      style={{ width: `${analytics.relationship_depth}%` }}
                                />
                              </div>
                                  <span className="text-xl font-bold text-purple-300 min-w-[60px] text-right">{analytics.relationship_depth}%</span>
                            </div>
                                <div className="text-sm text-white/70 font-medium">{analytics.shared_experiences} shared experiences</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getInteractionFrequencyTooltip(analytics.interaction_frequency)}>
                            <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg cursor-help hover:border-blue-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-sm font-bold text-white/80 mb-3 uppercase tracking-wide">Interaction Frequency</div>
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex-1 h-3 bg-black/60 rounded-full overflow-hidden shadow-inner">
                                    <div 
                                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all shadow-lg"
                                      style={{ width: `${analytics.interaction_frequency}%` }}
                                />
                              </div>
                                  <span className="text-xl font-bold text-blue-300 min-w-[60px] text-right">{analytics.interaction_frequency}%</span>
                            </div>
                                <div className="text-sm text-white/70 font-medium">Based on last 90 days</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                        </div>

                        {/* Influence Metrics */}
                        <div className="grid grid-cols-2 gap-6">
                          <Tooltip content={getInfluenceTooltip(analytics.character_influence_on_user, 'their', editedCharacter.name)}>
                            <Card className="bg-gradient-to-br from-purple-500/20 via-purple-600/15 to-purple-500/20 border-2 border-purple-500/40 shadow-lg cursor-help hover:border-purple-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-sm font-bold text-white/80 mb-3 uppercase tracking-wide">Their Influence on You</div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-3 bg-black/60 rounded-full overflow-hidden shadow-inner">
                                    <div 
                                      className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all shadow-lg"
                                      style={{ width: `${analytics.character_influence_on_user}%` }}
                                />
                              </div>
                                  <span className="text-xl font-bold text-purple-300 min-w-[60px] text-right">{analytics.character_influence_on_user}%</span>
                            </div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getInfluenceTooltip(analytics.user_influence_over_character, 'yours', editedCharacter.name)}>
                            <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg cursor-help hover:border-blue-500/60 transition-colors">
                              <CardContent className="p-5">
                                <div className="text-sm font-bold text-white/80 mb-3 uppercase tracking-wide">Your Influence Over Them</div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-3 bg-black/60 rounded-full overflow-hidden shadow-inner">
                                    <div 
                                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all shadow-lg"
                                      style={{ width: `${analytics.user_influence_over_character}%` }}
                                />
                              </div>
                                  <span className="text-xl font-bold text-blue-300 min-w-[60px] text-right">{analytics.user_influence_over_character}%</span>
                            </div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                        </div>

                        {/* Social Metrics */}
                        <div className="grid grid-cols-4 gap-4">
                          <Tooltip content={getSentimentScoreTooltip(analytics.sentiment_score)}>
                            <Card className="bg-gradient-to-br from-green-500/20 via-green-600/15 to-green-500/20 border-2 border-green-500/40 shadow-lg cursor-help hover:border-green-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Sentiment</div>
                                <div className={`text-3xl font-bold ${analytics.sentiment_score >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                  {analytics.sentiment_score > 0 ? '+' : ''}{analytics.sentiment_score}
                            </div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getTrustScoreTooltip(analytics.trust_score)}>
                            <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg cursor-help hover:border-blue-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Trust</div>
                                <div className="text-3xl font-bold text-blue-300">{analytics.trust_score}%</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getSupportScoreTooltip(analytics.support_score)}>
                            <Card className="bg-gradient-to-br from-green-500/20 via-green-600/15 to-green-500/20 border-2 border-green-500/40 shadow-lg cursor-help hover:border-green-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Support</div>
                                <div className="text-3xl font-bold text-green-300">{analytics.support_score}%</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getConflictScoreTooltip(analytics.conflict_score)}>
                            <Card className="bg-gradient-to-br from-red-500/20 via-red-600/15 to-red-500/20 border-2 border-red-500/40 shadow-lg cursor-help hover:border-red-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Conflict</div>
                                <div className="text-3xl font-bold text-red-300">{analytics.conflict_score}%</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                        </div>

                        {/* Additional Metrics */}
                        <div className="grid grid-cols-3 gap-4">
                          <Tooltip content={getValueScoreTooltip(analytics.value_score)}>
                            <Card className="bg-gradient-to-br from-yellow-500/20 via-yellow-600/15 to-yellow-500/20 border-2 border-yellow-500/40 shadow-lg cursor-help hover:border-yellow-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Value</div>
                                <div className="text-3xl font-bold text-yellow-300">{analytics.value_score}%</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getRelevanceScoreTooltip(analytics.relevance_score)}>
                            <Card className="bg-gradient-to-br from-cyan-500/20 via-cyan-600/15 to-cyan-500/20 border-2 border-cyan-500/40 shadow-lg cursor-help hover:border-cyan-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Relevance</div>
                                <div className="text-3xl font-bold text-cyan-300">{analytics.relevance_score}%</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                          <Tooltip content={getActivityLevelTooltip(analytics.activity_level)}>
                            <Card className="bg-gradient-to-br from-purple-500/20 via-purple-600/15 to-purple-500/20 border-2 border-purple-500/40 shadow-lg cursor-help hover:border-purple-500/60 transition-colors">
                              <CardContent className="p-4">
                                <div className="text-xs font-bold text-white/70 mb-2 uppercase tracking-wide">Activity</div>
                                <div className="text-3xl font-bold text-purple-300">{analytics.activity_level}%</div>
                              </CardContent>
                            </Card>
                          </Tooltip>
                        </div>

                        {/* Trend */}
                        <Tooltip content={getRelationshipTrendTooltip(analytics.trend)}>
                          <Card className="bg-gradient-to-br from-indigo-500/20 via-indigo-600/15 to-indigo-500/20 border-2 border-indigo-500/40 shadow-lg cursor-help hover:border-indigo-500/60 transition-colors">
                            <CardContent className="p-5">
                              <div className="flex items-center gap-4 flex-wrap">
                                <span className="text-base font-bold text-white/80 uppercase tracking-wide">Relationship Trend:</span>
                                {analytics.trend === 'deepening' && (
                                  <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/50 text-sm px-4 py-2 font-bold shadow-md">
                                    <TrendingUp className="h-4 w-4 mr-2" />
                              Deepening
                            </Badge>
                          )}
                                {analytics.trend === 'weakening' && (
                                  <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/50 text-sm px-4 py-2 font-bold shadow-md">
                                    <TrendingDown className="h-4 w-4 mr-2" />
                              Weakening
                            </Badge>
                          )}
                                {analytics.trend === 'stable' && (
                                  <Badge variant="outline" className="bg-gray-500/20 text-gray-300 border-gray-500/50 text-sm px-4 py-2 font-bold shadow-md">
                                    <Minus className="h-4 w-4 mr-2" />
                              Stable
                            </Badge>
                          )}
                                <div className="ml-auto flex items-center gap-2 bg-black/40 rounded-lg px-4 py-2 border border-indigo-500/30">
                                  <span className="text-sm font-semibold text-white/70">Known for</span>
                                  <span className="text-xl font-bold text-indigo-300">{analytics.relationship_duration_days}</span>
                                  <span className="text-sm font-semibold text-white/70">days</span>
                        </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Tooltip>

                        {/* SWOT Analysis */}
                        {(analytics.strengths?.length > 0 || 
                          analytics.weaknesses?.length > 0 || 
                          analytics.opportunities?.length > 0 || 
                          analytics.risks?.length > 0) && (
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
                  </>
                  ) : null;
                })()}
              </div>
            )}

            {/* Metadata Tab */}
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

        {/* Sticky Chatbox - Always visible at bottom */}
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-black/90 border-t border-primary/30 p-4 z-10 backdrop-blur-sm shadow-lg shadow-black/50">
          <ChatComposer
            onSubmit={handleChatSubmit}
            loading={chatLoading}
          />
        </div>

      </div>

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

