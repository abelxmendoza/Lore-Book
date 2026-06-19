import { useEffect, useState } from 'react';
import {
  Heart,
  Zap,
  Sparkles,
  Star,
  MapPin,
  Trophy,
  BookOpen,
  Users,
  Compass,
  Building2,
} from 'lucide-react';
import type { CelebrationPayload, CelebrationVariant } from '../../lib/celebrations';

type Props = CelebrationPayload & {
  onDone?: () => void;
};

const DEFAULT_DURATION: Record<CelebrationVariant, number> = {
  romantic: 1400,
  skill: 1800,
  character: 1500,
  location: 1500,
  quest: 1600,
  memory: 1500,
  value: 1400,
  organization: 1700,
};

const ROMANTIC_HEARTS = [
  { left: '18%', delay: '0ms', size: 'h-4 w-4' },
  { left: '42%', delay: '80ms', size: 'h-5 w-5' },
  { left: '68%', delay: '40ms', size: 'h-3.5 w-3.5' },
  { left: '84%', delay: '120ms', size: 'h-4 w-4' },
];

const SKILL_SPARKS = [
  { left: '8%', delay: '0ms', icon: Zap, color: 'text-amber-300' },
  { left: '22%', delay: '60ms', icon: Star, color: 'text-violet-300' },
  { left: '38%', delay: '30ms', icon: Sparkles, color: 'text-cyan-300' },
  { left: '55%', delay: '90ms', icon: Zap, color: 'text-primary' },
  { left: '72%', delay: '45ms', icon: Star, color: 'text-amber-200' },
  { left: '88%', delay: '110ms', icon: Sparkles, color: 'text-sky-300' },
];

const CHARACTER_SPARKS = [
  { left: '20%', delay: '0ms' },
  { left: '45%', delay: '70ms' },
  { left: '70%', delay: '35ms' },
];

const LOCATION_RINGS = ['0ms', '120ms', '240ms'];

function Badge({
  label,
  subtitle,
  xp,
  className,
  xpClassName,
}: {
  label: string;
  subtitle?: string;
  xp?: number;
  className: string;
  xpClassName?: string;
}) {
  return (
    <div className={`animate-celebration-enter text-center ${className}`}>
      <p className="text-sm font-semibold leading-snug">{label}</p>
      {subtitle && <p className="mt-0.5 text-[11px] opacity-80">{subtitle}</p>}
      {xp != null && xp > 0 && (
        <p className={`mt-1.5 text-xs font-bold tracking-wide animate-xp-pop ${xpClassName ?? ''}`}>
          +{xp} XP
        </p>
      )}
    </div>
  );
}

function RomanticLayer({ label }: { label: string }) {
  return (
    <>
      {ROMANTIC_HEARTS.map((heart, i) => (
        <Heart
          key={i}
          className={`absolute bottom-0 text-pink-400 fill-pink-400/70 animate-heart-float ${heart.size}`}
          style={{ left: heart.left, animationDelay: heart.delay }}
        />
      ))}
      <Badge
        label={label}
        className="relative rounded-full border border-pink-500/35 bg-pink-950/90 px-4 py-2 text-pink-100 shadow-lg shadow-pink-500/25 backdrop-blur-sm"
      />
    </>
  );
}

function SkillLayer({ label, subtitle, xp }: Pick<CelebrationPayload, 'label' | 'subtitle' | 'xp'>) {
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-0 animate-skill-ring-pulse rounded-full border-2 border-primary/50" />
        <div
          className="absolute inset-2 animate-skill-ring-pulse rounded-full border border-cyan-400/40"
          style={{ animationDelay: '0.15s' }}
        />
        <div className="absolute inset-0 animate-skill-orbit">
          <Zap className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
        </div>
      </div>
      {SKILL_SPARKS.map((spark, i) => {
        const Icon = spark.icon;
        return (
          <Icon
            key={i}
            className={`absolute bottom-2 animate-skill-spark-rise ${spark.color} h-4 w-4`}
            style={{ left: spark.left, animationDelay: spark.delay }}
          />
        );
      })}
      <Badge
        label={label}
        subtitle={subtitle}
        xp={xp}
        className="relative mt-2 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/25 via-violet-950/95 to-cyan-950/90 px-5 py-2.5 text-white shadow-[0_0_32px_rgba(154,77,255,0.35)] backdrop-blur-md"
        xpClassName="text-amber-300"
      />
    </>
  );
}

function CharacterLayer({ label, subtitle }: Pick<CelebrationPayload, 'label' | 'subtitle'>) {
  return (
    <>
      {CHARACTER_SPARKS.map((s, i) => (
        <Users
          key={i}
          className="absolute bottom-0 h-4 w-4 text-violet-300/90 animate-character-rise"
          style={{ left: s.left, animationDelay: s.delay }}
        />
      ))}
      <Badge
        label={label}
        subtitle={subtitle}
        className="relative rounded-full border border-violet-500/35 bg-violet-950/90 px-4 py-2 text-violet-100 shadow-lg shadow-violet-500/20 backdrop-blur-sm"
      />
    </>
  );
}

function LocationLayer({ label, subtitle }: Pick<CelebrationPayload, 'label' | 'subtitle'>) {
  return (
    <>
      {LOCATION_RINGS.map((delay, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/30 animate-location-ripple"
          style={{ animationDelay: delay }}
        />
      ))}
      <MapPin className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 text-cyan-300 animate-location-pin-drop" />
      <Badge
        label={label}
        subtitle={subtitle}
        className="relative mt-6 rounded-xl border border-cyan-500/35 bg-cyan-950/90 px-4 py-2 text-cyan-100 shadow-lg shadow-cyan-500/20 backdrop-blur-sm"
      />
    </>
  );
}

function QuestLayer({ label, subtitle, xp }: Pick<CelebrationPayload, 'label' | 'subtitle' | 'xp'>) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          className="absolute bottom-1 h-3.5 w-3.5 text-amber-300 animate-quest-star-burst"
          style={{ left: `${25 + i * 22}%`, animationDelay: `${i * 80}ms` }}
        />
      ))}
      <Trophy className="absolute left-1/2 top-0 h-7 w-7 -translate-x-1/2 text-amber-400 animate-celebration-enter" />
      <Badge
        label={label}
        subtitle={subtitle}
        xp={xp}
        className="relative mt-7 rounded-xl border border-amber-500/35 bg-amber-950/90 px-4 py-2 text-amber-100 shadow-lg shadow-amber-500/20 backdrop-blur-sm"
        xpClassName="text-amber-200"
      />
    </>
  );
}

function MemoryLayer({ label, subtitle }: Pick<CelebrationPayload, 'label' | 'subtitle'>) {
  return (
    <>
      <Sparkles className="absolute left-[30%] bottom-2 h-4 w-4 text-indigo-300 animate-skill-spark-rise" />
      <Sparkles
        className="absolute left-[65%] bottom-2 h-3.5 w-3.5 text-violet-300 animate-skill-spark-rise"
        style={{ animationDelay: '80ms' }}
      />
      <BookOpen className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 text-indigo-300 animate-celebration-enter" />
      <Badge
        label={label}
        subtitle={subtitle}
        className="relative mt-6 rounded-xl border border-indigo-500/35 bg-indigo-950/90 px-4 py-2 text-indigo-100 shadow-lg shadow-indigo-500/20 backdrop-blur-sm"
      />
    </>
  );
}

const ORGANIZATION_SPARKS = [
  { left: '16%', delay: '0ms' },
  { left: '44%', delay: '70ms' },
  { left: '72%', delay: '35ms' },
];

function OrganizationLayer({ label, subtitle, xp }: Pick<CelebrationPayload, 'label' | 'subtitle' | 'xp'>) {
  return (
    <>
      {ORGANIZATION_SPARKS.map((s, i) => (
        <Users
          key={i}
          className="absolute bottom-0 h-4 w-4 text-purple-300/90 animate-character-rise"
          style={{ left: s.left, animationDelay: s.delay }}
        />
      ))}
      <Building2 className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 text-purple-300 animate-celebration-enter" />
      <Badge
        label={label}
        subtitle={subtitle}
        xp={xp}
        className="relative mt-6 rounded-xl border border-purple-500/35 bg-purple-950/90 px-4 py-2 text-purple-100 shadow-lg shadow-purple-500/25 backdrop-blur-sm"
        xpClassName="text-purple-200"
      />
    </>
  );
}

function ValueLayer({ label, subtitle }: Pick<CelebrationPayload, 'label' | 'subtitle'>) {
  return (
    <>
      <Compass className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 text-emerald-300 animate-celebration-enter" />
      <Badge
        label={label}
        subtitle={subtitle}
        className="relative mt-6 rounded-full border border-emerald-500/35 bg-emerald-950/90 px-4 py-2 text-emerald-100 shadow-lg shadow-emerald-500/20 backdrop-blur-sm"
      />
    </>
  );
}

export const AddCelebrationOverlay = ({
  variant,
  label,
  subtitle,
  xp,
  durationMs,
  onDone,
}: Props) => {
  const [visible, setVisible] = useState(true);
  const duration = durationMs ?? DEFAULT_DURATION[variant];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDone]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[18%] z-[85] flex justify-center"
      aria-live="polite"
      role="status"
      data-testid={`celebration-overlay-${variant}`}
    >
      <div className="relative w-full max-w-sm px-6 min-h-[120px] flex flex-col items-center justify-end pb-2">
        {variant === 'romantic' && <RomanticLayer label={label} />}
        {variant === 'skill' && <SkillLayer label={label} subtitle={subtitle} xp={xp} />}
        {variant === 'character' && <CharacterLayer label={label} subtitle={subtitle} />}
        {variant === 'location' && <LocationLayer label={label} subtitle={subtitle} />}
        {variant === 'quest' && <QuestLayer label={label} subtitle={subtitle} xp={xp} />}
        {variant === 'memory' && <MemoryLayer label={label} subtitle={subtitle} />}
        {variant === 'value' && <ValueLayer label={label} subtitle={subtitle} />}
        {variant === 'organization' && <OrganizationLayer label={label} subtitle={subtitle} xp={xp} />}
      </div>
    </div>
  );
};
