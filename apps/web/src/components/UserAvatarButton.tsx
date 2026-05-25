import { useState, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserAvatarButtonProps {
  user: any;
  size?: number;
  className?: string;
  onAvatarChange?: (url: string) => void;
  /** If true, clicking opens the file picker to upload a new avatar */
  editable?: boolean;
}

export function UserAvatarButton({
  user,
  size = 40,
  className = '',
  onAvatarChange,
  editable = true,
}: UserAvatarButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Priority: locally uploaded > custom (user-set) > google > null
  const avatarUrl = !imgError
    ? (localAvatarUrl ||
       user?.user_metadata?.custom_avatar_url ||
       user?.user_metadata?.avatar_url ||
       null)
    : null;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    '';
  const initials = displayName ? displayName.charAt(0).toUpperCase() : '?';

  const handleUpload = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    setImgError(false);
    try {
      const ext = file.type.split('/')[1] || 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const url = `${publicUrl}?t=${Date.now()}`;
      await supabase.auth.updateUser({ data: { custom_avatar_url: url } });
      setLocalAvatarUrl(url);
      onAvatarChange?.(url);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const fontSize = Math.round(size * 0.38);

  return (
    <div
      className={`relative flex-shrink-0 ${editable ? 'group cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size }}
      onClick={() => editable && fileInputRef.current?.click()}
      title={editable ? 'Change photo' : displayName}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-full h-full rounded-full object-cover border-2 border-white/20"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="w-full h-full rounded-full bg-purple-700/60 border-2 border-purple-500/40 flex items-center justify-center text-white font-bold select-none"
          style={{ fontSize }}
        >
          {initials}
        </div>
      )}

      {/* Upload overlay — only shown when editable */}
      {editable && (
        <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          {uploading ? (
            <Loader2 className="text-white animate-spin" style={{ width: size * 0.38, height: size * 0.38 }} />
          ) : (
            <Camera className="text-white" style={{ width: size * 0.38, height: size * 0.38 }} />
          )}
        </div>
      )}

      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
        />
      )}
    </div>
  );
}
