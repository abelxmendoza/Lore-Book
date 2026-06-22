/**
 * Upload DM / text-message screenshots from chat composer.
 */
import { useRef, useState } from 'react';
import { Loader2, MessageSquare, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { fetchJson } from '../../../lib/api';

type Props = {
  characterId?: string;
  characterName?: string;
  onComplete?: (result: { message: string; characterName?: string }) => void;
  onError?: (error: string) => void;
};

async function compressImage(file: File, maxDim = 1400, quality = 0.82): Promise<string> {
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

export function MessageScreenshotUpload({ characterId, characterName, onComplete, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      const endpoint = characterId
        ? `/api/characters/${characterId}/media`
        : '/api/messages/screenshot';

      const body = characterId
        ? { kind: 'message', dataUrl, caption: caption.trim() || undefined, source: 'chat', analyzeImage: true }
        : { dataUrl, characterId, characterName, caption: caption.trim() || undefined, source: 'chat' };

      const res = await fetchJson<{ message?: string; character?: { name: string }; media: { text?: string | null } }>(
        endpoint,
        { method: 'POST', body: JSON.stringify(body) },
      );

      onComplete?.({
        message: res.message ?? `Saved message${res.media.text ? ' — text extracted' : ''}`,
        characterName: res.character?.name ?? characterName,
      });
      setCaption('');
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
      <p className="text-xs text-white/55 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        Upload a text-message screenshot — we extract the conversation and save it to the right person.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={characterName ? `Context (conversation with ${characterName})` : 'Who is this conversation with?'}
        className="w-full rounded-md border border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-white placeholder:text-white/30"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="gap-1.5 text-xs h-8"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? 'Analyzing…' : 'Upload message screenshot'}
      </Button>
    </div>
  );
}
