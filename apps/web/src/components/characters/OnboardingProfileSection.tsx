/**
 * Renders the structured identity graph captured during narrative onboarding
 * (stored on the self character's metadata.onboarding_profile) inside the Main
 * Character modal. Read-only surfacing of occupation / life phase / goals /
 * people / places / skills / values, so the populated data is visible.
 */

type Chip = { label: string; confidence?: number; evidence?: string };

export type OnboardingProfile = {
  identity?: { preferredName?: string; occupation?: string; lifePhase?: string; summary?: string };
  people?: Chip[];
  places?: Chip[];
  organizations?: Chip[];
  skills?: Chip[];
  interests?: Chip[];
  goals?: Chip[];
  projects?: Chip[];
  events?: Chip[];
  values?: Chip[];
};

const GROUPS: Array<{ key: keyof OnboardingProfile; label: string; icon: string }> = [
  { key: 'goals', label: 'Working toward', icon: '🎯' },
  { key: 'people', label: 'Your people', icon: '🧑' },
  { key: 'organizations', label: 'Organizations', icon: '🏢' },
  { key: 'places', label: 'Places', icon: '📍' },
  { key: 'projects', label: 'Projects', icon: '🛠️' },
  { key: 'skills', label: 'Skills', icon: '⚡' },
  { key: 'interests', label: 'Interests', icon: '✨' },
  { key: 'values', label: 'Values', icon: '💛' },
  { key: 'events', label: 'Life events', icon: '📅' },
];

function chipsOf(profile: OnboardingProfile, key: keyof OnboardingProfile): Chip[] {
  const v = profile[key];
  return Array.isArray(v) ? (v as Chip[]) : [];
}

export function OnboardingProfileSection({ profile }: { profile?: OnboardingProfile | null }) {
  if (!profile || typeof profile !== 'object') return null;

  const identity = profile.identity ?? {};
  const hasIdentity = !!(identity.occupation || identity.lifePhase);
  const populatedGroups = GROUPS.filter((g) => chipsOf(profile, g.key).length > 0);

  if (!hasIdentity && populatedGroups.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/20 bg-black/30 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-300/80">
        From your story
      </h3>

      {hasIdentity && (
        <div className="mb-3 flex flex-wrap gap-2">
          {identity.occupation && (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
              {identity.occupation}
            </span>
          )}
          {identity.lifePhase && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
              {identity.lifePhase}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3">
        {populatedGroups.map(({ key, label, icon }) => {
          const chips = chipsOf(profile, key);
          return (
            <div key={key}>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/40">
                {icon} {label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((chip, i) => (
                  <span
                    key={`${chip.label}-${i}`}
                    title={chip.evidence ? `“${chip.evidence}”` : undefined}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
