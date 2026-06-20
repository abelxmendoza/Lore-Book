/**
 * Rich "personality" panel for an organization/group — the LoreBook view that
 * treats a group as people + goals + power structure + relationships rather
 * than a bag of facts. Renders Mission, Culture, Structure, Reputation,
 * Resources, Activities, Communication, and an Influence score.
 *
 * Only sections with content render. A fully-empty profile (typical for a
 * freshly-tracked real organization) shows a single chat-first prompt instead
 * of a wall of blanks — same honesty principle as InsufficientData elsewhere.
 */
import {
  Target, Sparkles, Network, Award, Boxes, Activity, Radio, TrendingUp, MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { InsufficientData } from '../ui/InsufficientData';
import type { Organization } from './OrganizationProfileCard';
import {
  type OrganizationProfile,
  isProfileEmpty,
  computeInfluenceScore,
} from '../../lib/organizationProfile';

interface Props {
  organization: Organization;
  /** Jump to the chat tab to fill in / discuss the profile. */
  onAddInfo?: () => void;
  variant?: 'default' | 'compact';
}

const SectionCard = ({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof Target;
  title: string;
  accent: string;
  children: React.ReactNode;
}) => (
  <Card className="bg-black/40 border-border/50">
    <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
      <h3 className="text-xs sm:text-sm font-semibold text-white/70 flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${accent}`} />
        {title}
      </h3>
    </CardHeader>
    <CardContent className="space-y-2.5 sm:space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">{children}</CardContent>
  </Card>
);

const Para = ({ label, value }: { label: string; value?: string }) =>
  value ? (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1">{label}</p>
      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  ) : null;

const Chips = ({ label, items, cls }: { label: string; items?: string[]; cls?: string }) =>
  items && items.length > 0 ? (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <Badge
            key={`${it}-${i}`}
            variant="outline"
            className={cls ?? 'bg-white/5 text-white/70 border-white/15'}
          >
            {it}
          </Badge>
        ))}
      </div>
    </div>
  ) : null;

const BulletList = ({ label, items }: { label: string; items?: string[] }) =>
  items && items.length > 0 ? (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={`${it}-${i}`} className="text-sm text-white/75 flex items-start gap-2">
            <span className="text-white/30 mt-0.5">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

export const OrganizationProfilePanel = ({ organization, onAddInfo, variant = 'default' }: Props) => {
  const profile: OrganizationProfile | undefined =
    organization.profile ?? organization.metadata?.profile;

  const influence = computeInfluenceScore({
    analyticsInfluence: organization.analytics?.group_influence_on_user,
    memberCount: organization.member_count ?? organization.members?.length,
    usageCount: organization.usage_count,
    userRelationship: organization.user_relationship,
  });

  const compact = variant === 'compact';

  const influenceCard = compact ? (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wide text-white/45 flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-amber-300" />
          Influence on you
        </span>
        <span className="text-sm font-bold text-amber-200 tabular-nums">{influence}</span>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style={{ width: `${influence}%` }} />
      </div>
    </div>
  ) : (
    <SectionCard icon={TrendingUp} title="Influence On You" accent="text-yellow-400">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-amber-300 rounded-full"
            style={{ width: `${influence}%` }}
          />
        </div>
        <span className="text-sm font-bold text-yellow-300 tabular-nums">{influence}</span>
      </div>
      <p className="text-[11px] text-white/40">
        How much this group shapes your life, from your involvement and activity.
      </p>
    </SectionCard>
  );

  if (isProfileEmpty(profile)) {
    return (
      <div className={compact ? 'space-y-2' : 'space-y-4'}>
        {!compact && influenceCard}
        <InsufficientData
          icon={Sparkles}
          accent="purple"
          title={`Tell LoreBook about ${organization.name}`}
          description={
            compact
              ? 'Mission, culture, and roles appear as you chat about this group.'
              : 'Mission, culture, structure, reputation, and resources will appear here as you describe this group. A group is really its people, goals, and power structure — capture those and the AI can reason about it.'
          }
          action={
            onAddInfo
              ? { label: 'Add details in chat', icon: MessageSquare, onClick: onAddInfo }
              : undefined
          }
        />
      </div>
    );
  }

  const p = profile!;
  const hasMission = p.purpose || p.mission || p.long_term_vision || (p.short_term_goals?.length ?? 0) > 0;
  const hasCulture =
    (p.values?.length ?? 0) + (p.traditions?.length ?? 0) + (p.norms?.length ?? 0) + (p.taboos?.length ?? 0) > 0;
  const hasStructure = p.structure?.hierarchy || p.structure?.decision_making || (p.structure?.roles?.length ?? 0) > 0;
  const hasReputation =
    p.reputation?.public_image || p.reputation?.community_perception ||
    (p.reputation?.achievements?.length ?? 0) + (p.reputation?.controversies?.length ?? 0) > 0;
  const hasResources =
    p.resources?.funding ||
    (p.resources?.assets?.length ?? 0) + (p.resources?.facilities?.length ?? 0) + (p.resources?.technology?.length ?? 0) > 0;
  const hasComms =
    p.communication?.website || p.communication?.meeting_schedule ||
    (p.communication?.social_media?.length ?? 0) + (p.communication?.channels?.length ?? 0) > 0;

  if (compact) {
    return (
      <div className="space-y-2">
        {influenceCard}
        {hasMission && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
            <h4 className="text-[10px] uppercase tracking-wide text-emerald-300/80 flex items-center gap-1">
              <Target className="h-3 w-3" /> Mission
            </h4>
            {p.purpose && <p className="text-xs text-white/75 leading-snug line-clamp-3">{p.purpose}</p>}
            {p.mission && <p className="text-xs text-white/60 leading-snug line-clamp-2">{p.mission}</p>}
            {p.values && p.values.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {p.values.slice(0, 4).map((v) => (
                  <span key={v} className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-200 border border-pink-500/25">{v}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {(hasStructure || hasReputation || hasResources || hasComms || (p.activities?.length ?? 0) > 0) && (
          <details className="rounded-xl border border-white/10 bg-black/30 group">
            <summary className="px-3 py-2 text-xs font-medium text-white/60 cursor-pointer list-none flex items-center justify-between">
              More about this group
              <span className="text-white/30 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-3 pb-3 space-y-2 border-t border-white/8 pt-2">
              {hasCulture && p.traditions && p.traditions.length > 0 && (
                <p className="text-[11px] text-white/55"><span className="text-white/35">Traditions: </span>{p.traditions.slice(0, 2).join(' · ')}</p>
              )}
              {hasStructure && p.structure?.hierarchy && (
                <p className="text-[11px] text-white/55"><span className="text-white/35">Structure: </span>{p.structure.hierarchy}</p>
              )}
              {hasReputation && p.reputation?.public_image && (
                <p className="text-[11px] text-white/55 line-clamp-2">{p.reputation.public_image}</p>
              )}
              {p.activities && p.activities.length > 0 && (
                <p className="text-[11px] text-white/55"><span className="text-white/35">Activities: </span>{p.activities.slice(0, 3).join(', ')}</p>
              )}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {influenceCard}

      {hasMission && (
        <SectionCard icon={Target} title="Mission & Purpose" accent="text-emerald-400">
          <Para label="Purpose" value={p.purpose} />
          <Para label="Mission" value={p.mission} />
          <BulletList label="Short-term goals" items={p.short_term_goals} />
          <Para label="Long-term vision" value={p.long_term_vision} />
        </SectionCard>
      )}

      {hasCulture && (
        <SectionCard icon={Sparkles} title="Culture" accent="text-pink-400">
          <Chips label="Values" items={p.values} cls="bg-pink-500/15 text-pink-200 border-pink-500/30" />
          <Chips label="Traditions & inside jokes" items={p.traditions} />
          <Chips label="Norms" items={p.norms} cls="bg-blue-500/15 text-blue-200 border-blue-500/30" />
          <Chips label="Taboos" items={p.taboos} cls="bg-red-500/15 text-red-200 border-red-500/30" />
        </SectionCard>
      )}

      {hasStructure && (
        <SectionCard icon={Network} title="Structure" accent="text-indigo-400">
          <Para label="Hierarchy" value={p.structure?.hierarchy} />
          <Para label="Decision-making" value={p.structure?.decision_making} />
          {p.structure?.roles && p.structure.roles.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">Roles</p>
              <ul className="space-y-1.5">
                {p.structure.roles.map((r, i) => (
                  <li key={`${r.role}-${i}`} className="text-sm text-white/75">
                    <span className="font-semibold text-white/85">{r.role}</span>
                    {r.responsibility && <span className="text-white/55"> — {r.responsibility}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {hasReputation && (
        <SectionCard icon={Award} title="Reputation" accent="text-amber-400">
          <Para label="Public image" value={p.reputation?.public_image} />
          <Para label="Community perception" value={p.reputation?.community_perception} />
          <BulletList label="Achievements" items={p.reputation?.achievements} />
          <BulletList label="Controversies" items={p.reputation?.controversies} />
        </SectionCard>
      )}

      {hasResources && (
        <SectionCard icon={Boxes} title="Resources" accent="text-cyan-400">
          <Para label="Funding" value={p.resources?.funding} />
          <Chips label="Assets" items={p.resources?.assets} />
          <Chips label="Facilities" items={p.resources?.facilities} />
          <Chips label="Technology" items={p.resources?.technology} />
        </SectionCard>
      )}

      {p.activities && p.activities.length > 0 && (
        <SectionCard icon={Activity} title="Activities" accent="text-green-400">
          <Chips label="Day-to-day & operations" items={p.activities} cls="bg-green-500/15 text-green-200 border-green-500/30" />
        </SectionCard>
      )}

      {hasComms && (
        <SectionCard icon={Radio} title="Communication" accent="text-sky-400">
          {p.communication?.website && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1">Website</p>
              <a
                href={p.communication.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-300 hover:text-sky-200 underline break-all"
              >
                {p.communication.website}
              </a>
            </div>
          )}
          <Chips label="Social media" items={p.communication?.social_media} />
          <Chips label="Channels" items={p.communication?.channels} />
          <Para label="Meeting schedule" value={p.communication?.meeting_schedule} />
        </SectionCard>
      )}
    </div>
  );
};
