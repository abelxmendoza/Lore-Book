import type { CharacterProfile } from '../../api/characters';
import { CharacterAvatar } from './CharacterAvatar';

export const CharacterHeader = ({ profile }: { profile: CharacterProfile }) => (
  <div className="flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
    <CharacterAvatar url={profile.portraitUrl || profile.avatar_url} name={profile.name} size={64} />
    <div>
      <div className="text-2xl font-semibold text-foreground">{profile.name}</div>
      <div className="text-sm text-white/60">{profile.pronouns}</div>
      {profile.bio && <p className="text-sm text-white/70">{profile.bio}</p>}
    </div>
  </div>
);
