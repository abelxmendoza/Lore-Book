import { useState } from 'react';
import { UserCircle } from 'lucide-react';
import { LazyImage } from '../ui/LazyImage';

type CharacterAvatarProps = {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
};

export function CharacterAvatar({ url, name, size = 56, className = '' }: CharacterAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // If no URL or image failed to load, show fallback
  if (!url || imageError) {
    return (
      <div
        className={`rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        aria-label={`${name} avatar`}
      >
        <UserCircle className="text-white/40" size={size * 0.6} />
      </div>
    );
  }

  return (
    <LazyImage
      src={url}
      alt={`${name} avatar`}
      className={`rounded-full border border-zinc-800 bg-zinc-900 object-cover ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setImageError(true)}
      placeholder={
        <div
          className={`rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center ${className}`}
          style={{ width: size, height: size }}
        >
          <UserCircle className="text-white/40" size={size * 0.6} />
        </div>
      }
    />
  );
}
