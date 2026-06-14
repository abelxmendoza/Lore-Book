import { useEffect, useState } from 'react';
import {
  Star, Sparkles, ChevronRight, BookOpen, Users, Tag,
  Briefcase, DollarSign, Activity, Smile, Heart as HeartIcon, Home,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { CharacterAvatar } from './CharacterAvatar';
import { fetchJson } from '../../lib/api';
import { isSyntheticSelfId } from '../../lib/isSelfCharacter';
import { selfCharacterApi } from '../../api/selfCharacter';
import type { Character } from './CharacterProfileCard';

type CharacterAttribute = {
  id: string;
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
};

type Props = {
  character: Character;
  /** Auth user — avatar / name fallback when the character record is sparse. */
  user?: {
    user_metadata?: Record<string, unknown>;
    email?: string | null;
  } | null;
  onClick?: () => void;
  /** When false, card is display-only (legacy — prefer always passing onClick). */
  interactive?: boolean;
};

const getAttributeIcon = (type: string) => {
  switch (type) {
    case 'employment_status':
    case 'occupation':
    case 'workplace':
      return <Briefcase className="h-3 w-3" />;
    case 'financial_status':
      return <DollarSign className="h-3 w-3" />;
    case 'lifestyle_pattern':
      return <Activity className="h-3 w-3" />;
    case 'personality_trait':
      return <Smile className="h-3 w-3" />;
    case 'relationship_status':
      return <HeartIcon className="h-3 w-3" />;
    case 'living_situation':
      return <Home className="h-3 w-3" />;
    default:
      return <Tag className="h-3 w-3" />;
  }
};

const getAttributeColor = (type: string) => {
  switch (type) {
    case 'employment_status':
    case 'occupation':
    case 'workplace':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'financial_status':
      return 'bg-green-500/20 text-green-300 border-green-500/30';
    case 'lifestyle_pattern':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'personality_trait':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    case 'relationship_status':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    case 'living_situation':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
    default:
      return 'bg-white/10 text-white/60 border-white/20';
  }
};

export const MainCharacterProfileCard = ({ character, user, onClick, interactive = true }: Props) => {
  const [attributes, setAttributes] = useState<CharacterAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);

  const displayName =
    character.name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You';

  const avatarUrl =
    character.avatar_url ||
    (user?.user_metadata?.custom_avatar_url as string | undefined) ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    null;

  const canOpenDetail = interactive && Boolean(onClick);

  useEffect(() => {
    let cancelled = false;
    setLoadingAttributes(true);

    const load = async () => {
      try {
        if (isSyntheticSelfId(character.id)) {
          await selfCharacterApi.ensureSelf().catch(() => {});
        }
        const profile = await selfCharacterApi.getProfile();
        if (cancelled) return;
        setAttributes(
          (profile.attributes ?? []).map((a, i) => ({
            id: `attr-${i}`,
            attributeType: a.attributeType,
            attributeValue: a.attributeValue,
            confidence: a.confidence,
            isCurrent: a.isCurrent,
          }))
        );
      } catch {
        if (!cancelled && !isSyntheticSelfId(character.id)) {
          fetchJson<{ attributes: CharacterAttribute[] }>(
            `/api/characters/${character.id}/attributes?currentOnly=true`
          )
            .then(r => { if (!cancelled) setAttributes(r.attributes || []); })
            .catch(() => { if (!cancelled) setAttributes([]); });
        } else if (!cancelled) {
          setAttributes([]);
        }
      } finally {
        if (!cancelled) setLoadingAttributes(false);
      }
    };

    void load();
    const onUpdated = () => { void load(); };
    window.addEventListener('lk:characters-updated', onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('lk:characters-updated', onUpdated);
    };
  }, [character.id]);

  const summary =
    character.summary ||
    'Your story grows with every conversation — attributes and facts sync from chat.';

  return (
    <Card
      className={`group relative overflow-hidden border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-black/70 to-purple-950/25 shadow-[0_0_32px_rgba(251,191,36,0.12)] transition-all duration-300 ${
        canOpenDetail
          ? 'cursor-pointer hover:border-amber-400/60 hover:shadow-[0_0_40px_rgba(251,191,36,0.22)] hover:-translate-y-0.5'
          : 'cursor-default'
      }`}
      onClick={canOpenDetail ? onClick : undefined}
      onKeyDown={canOpenDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      role={canOpenDetail ? 'button' : undefined}
      tabIndex={canOpenDetail ? 0 : undefined}
      data-testid="main-character-card"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />

      <div className="relative flex flex-col sm:flex-row sm:items-stretch gap-0">
        {/* Hero strip */}
        <div className="relative flex sm:flex-col items-center justify-center gap-3 sm:w-36 md:w-44 px-4 py-4 sm:py-6 bg-gradient-to-br from-amber-500/15 via-primary/10 to-purple-600/10 border-b sm:border-b-0 sm:border-r border-amber-500/20">
          <CharacterAvatar
            url={avatarUrl}
            characterId={character.id}
            archetype={character.archetype}
            role={character.role}
            name={displayName}
            size={56}
            className="sm:w-16 sm:h-16 ring-2 ring-amber-400/50 ring-offset-2 ring-offset-black/80"
          />
          <Badge
            variant="outline"
            className="bg-amber-500/20 text-amber-200 border-amber-400/50 text-[10px] px-2 py-0.5 flex items-center gap-1 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
          >
            <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
            Main Character
          </Badge>
        </div>

        <div className="flex-1 min-w-0">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-bold text-white group-hover:text-amber-100 transition-colors truncate">
                    {displayName}
                  </h3>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/80 border border-amber-500/30 rounded px-1.5 py-0.5">
                    you
                  </span>
                </div>
                <p className="text-sm text-amber-200/70 mt-0.5 font-medium">
                  {character.role || 'Protagonist · Your story'}
                </p>
                {character.archetype && (
                  <Badge
                    variant="outline"
                    className="mt-2 bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0"
                  >
                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                    {character.archetype}
                  </Badge>
                )}
              </div>
              {canOpenDetail && (
                <ChevronRight className="h-5 w-5 text-amber-400/40 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
              )}
            </div>
          </CardHeader>

          <CardContent className="px-4 sm:px-5 pb-4 pt-0 space-y-3">
            <p className="text-xs sm:text-sm text-white/65 leading-relaxed line-clamp-2 sm:line-clamp-3">
              {summary}
            </p>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-3 text-[10px] sm:text-xs text-white/45 font-mono">
              {(character.memory_count ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3 text-amber-400/70" />
                  {character.memory_count} memories
                </span>
              )}
              {(character.relationship_count ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-amber-400/70" />
                  {character.relationship_count} connections
                </span>
              )}
              {character.tags && character.tags.length > 0 && (
                <span className="flex items-center gap-1 truncate max-w-[12rem]">
                  <Tag className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
                  {character.tags.slice(0, 3).join(' · ')}
                </span>
              )}
            </div>

            {/* Life attributes */}
            {loadingAttributes ? (
              <p className="text-[10px] text-white/35 italic">Reading your profile…</p>
            ) : attributes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {attributes.slice(0, 6).map(attr => (
                  <Badge
                    key={attr.id}
                    variant="outline"
                    className={`${getAttributeColor(attr.attributeType)} text-[10px] px-2 py-0.5 flex items-center gap-1`}
                    title={`${attr.attributeType}: ${attr.attributeValue}`}
                  >
                    {getAttributeIcon(attr.attributeType)}
                    <span className="truncate max-w-[9rem]">{attr.attributeValue}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-white/35 italic">
                {canOpenDetail
                  ? 'Attributes appear as LoreBook learns about you from chat and journal.'
                  : 'Keep chatting — your main character profile builds automatically.'}
              </p>
            )}
          </CardContent>
        </div>
      </div>
    </Card>
  );
};

/** Fallback when no self character exists in the database yet. */
export function buildSyntheticMainCharacter(
  user?: Props['user'],
): Character {
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You';

  return {
    id: 'self-synthetic',
    name: displayName,
    role: 'Main Character',
    archetype: 'protagonist',
    importance_level: 'protagonist',
    status: 'active',
    summary: 'The protagonist of your story — your hopes, arcs, and growth live here.',
    tags: ['your story'],
    metadata: { is_self: true, is_user: true },
    avatar_url:
      (user?.user_metadata?.custom_avatar_url as string | undefined) ||
      (user?.user_metadata?.avatar_url as string | undefined) ||
      null,
  };
}
