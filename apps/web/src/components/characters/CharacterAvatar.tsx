import { useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { LazyImage } from '../ui/LazyImage';
import {
  resolveCharacterAvatarUrl,
  resolveCharacterAvatarUrlExact,
  type CharacterAvatarSource,
} from '../../lib/characterAvatar';

type CharacterAvatarProps = {
  url?: string | null;
  name: string;
  characterId?: string;
  archetype?: string | null;
  role?: string | null;
  size?: number;
  className?: string;
};

export function CharacterAvatar({
  url,
  name,
  characterId,
  archetype,
  role,
  size = 56,
  className = '',
}: CharacterAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const source: CharacterAvatarSource | null = characterId
    ? { id: characterId, avatar_url: url, archetype, role }
    : null;

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    if (url) return url;
    if (source) return resolveCharacterAvatarUrl(source);
    return null;
  });

  useEffect(() => {
    setImageError(false);
    if (url) {
      setResolvedUrl(url);
      return;
    }
    if (!source) {
      setResolvedUrl(null);
      return;
    }
    setResolvedUrl(resolveCharacterAvatarUrl(source));
    void resolveCharacterAvatarUrlExact(source).then(setResolvedUrl);
  }, [url, characterId, archetype, role]);

  if (!resolvedUrl || imageError) {
    return (
      <div
        className={`shrink-0 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center ${className}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
        aria-label={`${name} avatar`}
      >
        <UserCircle className="text-white/40" size={size * 0.6} />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      aria-label={`${name} avatar`}
    >
      <LazyImage
        src={resolvedUrl}
        alt={`${name} avatar`}
        className="h-full w-full rounded-full border border-zinc-800 bg-zinc-900 object-cover"
        loading="lazy"
        onError={() => setImageError(true)}
        placeholder={
          <div className="flex h-full w-full items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
            <UserCircle className="text-white/40" size={size * 0.6} />
          </div>
        }
      />
    </div>
  );
}
