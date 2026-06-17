/**
 * Character Photos + Messages — gallery for images and DM/text screenshots.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, MessageSquare, Plus, Trash2, Loader2, Upload } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { LazyImage } from '../ui/LazyImage';

export type CharacterMediaItem = {
  id: string;
  character_id: string;
  kind: 'photo' | 'message';
  url: string | null;
  text: string | null;
  caption: string | null;
  source: string | null;
  created_at: string;
};

type Props = {
  characterId: string;
  characterName: string;
  kind: 'photo' | 'message';
};

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
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
  return canvas.toDataURL('image/jpeg', quality);
}

export function CharacterMediaPanel({ characterId, characterName, kind }: Props) {
  const [items, setItems] = useState<CharacterMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [caption, setCaption] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { media } = await fetchJson<{ media: CharacterMediaItem[] }>(
        `/api/characters/${characterId}/media?kind=${kind}`
      );
      setItems(media ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [characterId, kind]);

  useEffect(() => { void load(); }, [load]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await compressImage(file);
      await fetchJson(`/api/characters/${characterId}/media`, {
        method: 'POST',
        body: JSON.stringify({ kind, dataUrl, caption: caption.trim() || undefined, source: 'characters_book' }),
      });
      setCaption('');
      await load();
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
        body: JSON.stringify({ kind: 'message', text, caption: caption.trim() || undefined, source: 'characters_book' }),
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
      <p className="text-sm text-white/50">
        {kind === 'photo'
          ? `Photos of ${characterName} — reference images LoreBook can discuss in chat.`
          : `Messages and DM screenshots with ${characterName} — paste text or upload screenshots we analyze together.`}
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
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
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {kind === 'photo' ? 'Upload photo' : 'Upload screenshot'}
          </Button>
          {kind === 'message' && (
            <Button type="button" size="sm" disabled={uploading || !textDraft.trim()} onClick={() => void saveTextMessage()}>
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
          No {kind === 'photo' ? 'photos' : 'messages'} yet
        </div>
      ) : kind === 'photo' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-xl overflow-hidden border border-white/10 bg-black/40">
              {item.url && (
                <LazyImage src={item.url} alt={item.caption ?? characterName} className="w-full aspect-square object-cover" />
              )}
              {item.caption && <p className="p-2 text-xs text-white/60 line-clamp-2">{item.caption}</p>}
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
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-4 group">
              <div className="flex justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wide text-white/35">
                  {new Date(item.created_at).toLocaleString()}
                </span>
                <button type="button" onClick={() => void remove(item.id)} className="text-white/30 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {item.url && (
                <LazyImage src={item.url} alt="Message screenshot" className="max-h-48 rounded-lg border border-white/10 mb-2" />
              )}
              {item.text && <p className="text-sm text-white/80 whitespace-pre-wrap">{item.text}</p>}
              {item.caption && <p className="text-xs text-white/45 mt-2 italic">{item.caption}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
