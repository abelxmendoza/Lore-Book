import type { CharacterProfile } from '../../api/characters';

export const CharacterHeader = ({ profile }: { profile: CharacterProfile }) => (
  <div className="flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-cyan" />
    <div>
      <div className="text-2xl font-semibold text-foreground">{profile.name}</div>
      <div className="text-sm text-white/60">{profile.pronouns}</div>
      {profile.bio && <p className="text-sm text-white/70">{profile.bio}</p>}
    </div>
  </div>
);
