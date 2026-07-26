/**
 * Character Photos + Messages — gallery for images and DM/text screenshots.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, MessageSquare, Plus, Trash2, Loader2, Upload } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { LazyImage } from '../ui/LazyImage';

export type PhotoRole = 'selfie' | 'appears_in';

export type CharacterMediaItem = {
  id: string;
  character_id: string;
  kind: 'photo' | 'message';
  url: string | null;
  text: string | null;
  caption: string | null;
  source: string | null;
  created_at: string;
  metadata?: {
    photoRole?: PhotoRole;
    isSelfie?: boolean;
    analysis?: { summary?: string; platform?: string; counterpartName?: string };
    pipeline?: {
      lexicalIntelligence?: { spanCount?: number; entities?: string[] };
      loreBookParse?: { applied?: number; appliedItems?: Array<{ domain: string; name: string }> };
      interpretation?: { relationshipCount?: number; entityCount?: number };
    };
  };
};

type Props = {
  characterId: string;
  characterName: string;
  kind: 'photo' | 'message';
  /** Self profile: show Selfies / Pictures I'm In switcher for photos. */
  isSelfProfile?: boolean;
};

const DEMO_MEDIA: Record<'photo' | 'message', CharacterMediaItem[]> = {
  photo: [
    {
      id: 'demo-p1',
      character_id: 'demo',
      kind: 'photo',
      url: 'https://picsum.photos/seed/lk-selfie-1/500/500',
      text: null,
      caption: 'Mirror check before rehearsal',
      source: 'selfie',
      created_at: new Date().toISOString(),
      metadata: { photoRole: 'selfie', isSelfie: true },
    },
    {
      id: 'demo-p2',
      character_id: 'demo',
      kind: 'photo',
      url: 'https://picsum.photos/seed/lk-group-1/500/500',
      text: null,
      caption: 'Crew night out',
      source: 'demo',
      created_at: new Date(Date.now() - 864e5).toISOString(),
      metadata: { photoRole: 'appears_in', isSelfie: false },
    },
    {
      id: 'demo-p3',
      character_id: 'demo',
      kind: 'photo',
      url: 'https://picsum.photos/seed/lk-selfie-2/500/500',
      text: null,
      caption: 'Front-camera selfie',
      source: 'selfie',
      created_at: new Date(Date.now() - 3 * 864e5).toISOString(),
      metadata: { photoRole: 'selfie', isSelfie: true },
    },
  ],
  message: [
    {
      id: 'demo-m1',
      character_id: 'demo',
      kind: 'message',
      url: null,
      text: 'hey! are we still on for saturday?',
      caption: 'iMessage',
      source: 'imessage',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-m2',
      character_id: 'demo',
      kind: 'message',
      url: 'https://picsum.photos/seed/lk-dm-1/360/640',
      text: 'Screenshot: planning the night out',
      caption: 'DM screenshot',
      source: 'instagram',
      created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    },
  ],
};

function mediaPhotoRole(item: CharacterMediaItem): PhotoRole {
  if (item.metadata?.photoRole === 'selfie' || item.metadata?.photoRole === 'appears_in') {
    return item.metadata.photoRole;
  }
  if (item.metadata?.isSelfie === true || item.source === 'selfie') return 'selfie';
  return 'appears_in';
}

async function fileToCompressedBlob(file: File, maxDim = 1400, quality = 0.78): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob) throw new Error('Could not compress image');
    return blob;
  } catch {
    // HEIC / unsupported decode — send original bytes via multipart.
    return file;
  }
}

export function CharacterMediaPanel({
  characterId,
  characterName,
  kind,
  isSelfProfile = false,
}: Props) {
  const [items, setItems] = useState<CharacterMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [caption, setCaption] = useState('');
  const [photoRole, setPhotoRole] = useState<PhotoRole>('selfie');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const roleQuery =
        kind === 'photo' && isSelfProfile ? `&photoRole=${encodeURIComponent(photoRole)}` : '';
      const demo =
        kind === 'photo' && isSelfProfile
          ? DEMO_MEDIA.photo.filter((m) => mediaPhotoRole(m) === photoRole)
          : DEMO_MEDIA[kind];
      const { media } = await fetchJson<{ media: CharacterMediaItem[] }>(
        `/api/characters/${characterId}/media?kind=${kind}${roleQuery}`,
        undefined,
        { mockData: { media: demo } },
      );
      setItems(media ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [characterId, kind, isSelfProfile, photoRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      if (kind === 'photo') {
        const blob = await fileToCompressedBlob(file);
        const form = new FormData();
        form.append('kind', 'photo');
        form.append('file', blob, file.name.replace(/\.\w+$/, '') + '.jpg');
        if (caption.trim()) form.append('caption', caption.trim());
        form.append('source', isSelfProfile && photoRole === 'selfie' ? 'selfie' : 'characters_book');
        if (isSelfProfile) {
          form.append('photoRole', photoRole);
          // Selfies / Pictures I'm In → server runs vision appearance learning.
          form.append('analyzeImage', 'true');
        }

        const mockItem: CharacterMediaItem = {
          id: `local-${Date.now()}`,
          character_id: characterId,
          kind: 'photo',
          url: URL.createObjectURL(blob),
          text: null,
          caption: caption.trim() || null,
          source: photoRole === 'selfie' ? 'selfie' : 'characters_book',
          created_at: new Date().toISOString(),
          metadata: { photoRole, isSelfie: photoRole === 'selfie' },
        };

        await fetchJson<{ media: CharacterMediaItem }>(
          `/api/characters/${characterId}/media`,
          { method: 'POST', body: form },
          { mockData: { media: mockItem } },
        );
        setCaption('');
        await load();
        return;
      }

      // Message screenshots still use compressed data URL + JSON (smaller OCR frames).
      const blob = await fileToCompressedBlob(file, 1200, 0.8);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(blob);
      });
      const res = await fetchJson<{ media: CharacterMediaItem }>(
        `/api/characters/${characterId}/media`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind,
            dataUrl,
            caption: caption.trim() || undefined,
            source: 'characters_book',
            analyzeImage: true,
          }),
        },
      );
      setCaption('');
      await load();
      if (res.media?.text) setTextDraft(res.media.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const saveTextMessage = async () => {
    const text = textDraft.trim();
    if (!text) return;
    setUploading(true);
    setError(null);
    try {
      await fetchJson(`/api/characters/${characterId}/media`, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'message',
          text,
          caption: caption.trim() || undefined,
          source: 'characters_book',
        }),
      });
      setTextDraft('');
      setCaption('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/characters/${characterId}/media/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-white/40">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {kind === 'photo' && isSelfProfile && (
        <div
          className="inline-flex rounded-lg border border-amber-500/30 bg-black/40 p-0.5"
          role="tablist"
          aria-label="Photo type"
        >
          {(
            [
              { value: 'selfie' as const, label: 'Selfies' },
              { value: 'appears_in' as const, label: "Pictures I'm In" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={photoRole === value}
              data-testid={`photo-role-${value}`}
              onClick={() => setPhotoRole(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                photoRole === value
                  ? 'bg-amber-500/25 text-amber-100 border border-amber-400/40'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-white/50">
        {kind === 'photo'
          ? isSelfProfile
            ? photoRole === 'selfie'
              ? 'Front-camera and mirror selfies of you — used for appearance memory.'
              : 'Group shots and candid photos where you appear in the frame.'
            : `Photos of ${characterName} — reference images LoreBook can discuss in chat.`
          : `Messages and DM screenshots with ${characterName} — paste text or upload screenshots we analyze together.`}
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = '';
          }}
        />
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption / context"
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30"
        />
        {kind === 'message' && (
          <Textarea
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="Paste message text from a DM or conversation…"
            rows={3}
            className="bg-transparent border-white/10 text-white placeholder:text-white/30"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="gap-2"
            data-testid="character-media-upload"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {kind === 'photo'
              ? isSelfProfile && photoRole === 'selfie'
                ? 'Upload selfie'
                : isSelfProfile
                  ? "Upload picture I'm in"
                  : 'Upload photo'
              : uploading
                ? 'Analyzing screenshot…'
                : 'Upload screenshot'}
          </Button>
          {kind === 'message' && (
            <Button
              type="button"
              size="sm"
              disabled={uploading || !textDraft.trim()}
              onClick={() => void saveTextMessage()}
            >
              <Plus className="h-4 w-4 mr-1" /> Save text
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 py-12 text-center text-white/40 text-sm">
          {kind === 'photo' ? (
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
          ) : (
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          )}
          {kind === 'photo' && isSelfProfile
            ? photoRole === 'selfie'
              ? 'No selfies yet'
              : "No pictures you're in yet"
            : `No ${kind === 'photo' ? 'photos' : 'messages'} yet`}
        </div>
      ) : kind === 'photo' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-xl overflow-hidden border border-white/10 bg-black/40"
            >
              {item.url && (
                <LazyImage
                  src={item.url}
                  alt={item.caption ?? characterName}
                  className="w-full aspect-square object-cover"
                />
              )}
              {item.caption && (
                <p className="p-2 text-xs text-white/60 line-clamp-2">{item.caption}</p>
              )}
              <button
                type="button"
                onClick={() => void remove(item.id)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white/70 opacity-0 group-hover:opacity-100 transition"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const analysis = item.metadata?.analysis;
            const pipeline = item.metadata?.pipeline;
            const entities = pipeline?.lexicalIntelligence?.entities ?? [];
            const loreApplied = pipeline?.loreBookParse?.applied ?? 0;
            const loreItems = pipeline?.loreBookParse?.appliedItems ?? [];

            return (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-4 group">
                <div className="flex justify-between gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">
                    {new Date(item.created_at).toLocaleString()}
                    {analysis?.platform ? ` · ${analysis.platform}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    className="text-white/30 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {item.url && (
                  <LazyImage
                    src={item.url}
                    alt="Message screenshot"
                    className="max-h-48 rounded-lg border border-white/10 mb-2"
                  />
                )}
                {analysis?.summary && (
                  <p className="text-xs text-white/50 mb-2 italic">{analysis.summary}</p>
                )}
                {item.text && <p className="text-sm text-white/80 whitespace-pre-wrap">{item.text}</p>}
                {entities.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entities.slice(0, 8).map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200"
                      >
                        {name}
                      </span>
                    ))}
                    {entities.length > 8 && (
                      <span className="text-[10px] text-white/35 self-center">
                        +{entities.length - 8} more
                      </span>
                    )}
                  </div>
                )}
                {(loreApplied > 0 || (pipeline?.interpretation?.relationshipCount ?? 0) > 0) && (
                  <p className="mt-2 text-[10px] text-emerald-300/80">
                    {loreApplied > 0 &&
                      `LoreBook: ${loreApplied} seed${loreApplied === 1 ? '' : 's'} added`}
                    {loreApplied > 0 &&
                      loreItems.length > 0 &&
                      ` (${loreItems
                        .map((i) => i.name)
                        .slice(0, 3)
                        .join(', ')})`}
                    {(pipeline?.interpretation?.relationshipCount ?? 0) > 0 &&
                      `${loreApplied > 0 ? ' · ' : ''}${pipeline!.interpretation!.relationshipCount} relationship${pipeline!.interpretation!.relationshipCount === 1 ? '' : 's'} detected`}
                  </p>
                )}
                {item.caption && <p className="text-xs text-white/45 mt-2 italic">{item.caption}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
