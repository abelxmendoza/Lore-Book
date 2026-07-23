/**
 * Upload DM / text-message screenshots from chat composer.
 * Supports multi-select — processes each screenshot in order.
 */
import { useRef, useState } from 'react';
import { Loader2, MessageSquare, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { fetchJson } from '../../../lib/api';

const MAX_SCREENSHOTS_PER_BATCH = 12;

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

type ScreenshotSaveResult = {
  message?: string;
  character?: { name: string };
  media: { text?: string | null };
};

export function MessageScreenshotUpload({ characterId, characterName, onComplete, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  const uploadOne = async (file: File): Promise<ScreenshotSaveResult> => {
    const dataUrl = await compressImage(file);
    const endpoint = characterId
      ? `/api/characters/${characterId}/media`
      : '/api/messages/screenshot';

    const body = characterId
      ? { kind: 'message', dataUrl, caption: caption.trim() || undefined, source: 'chat', analyzeImage: true }
      : { dataUrl, characterId, characterName, caption: caption.trim() || undefined, source: 'chat' };

    return fetchJson<ScreenshotSaveResult>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  };

  const uploadMany = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      onError?.('Select image files (screenshots of DMs, Stories, etc.)');
      return;
    }

    const batch = list.slice(0, MAX_SCREENSHOTS_PER_BATCH);
    setUploading(true);
    let saved = 0;
    let lastCharacterName = characterName;
    const errors: string[] = [];

    try {
      for (let i = 0; i < batch.length; i++) {
        setProgress(`Analyzing ${i + 1}/${batch.length}…`);
        try {
          const res = await uploadOne(batch[i]);
          saved += 1;
          lastCharacterName = res.character?.name ?? lastCharacterName;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Screenshot ${i + 1} failed`);
        }
      }

      if (saved > 0) {
        const skipped = list.length > batch.length ? ` (capped at ${MAX_SCREENSHOTS_PER_BATCH})` : '';
        onComplete?.({
          message:
            saved === 1
              ? `Saved message screenshot${lastCharacterName ? ` for ${lastCharacterName}` : ''}${skipped}`
              : `Saved ${saved}/${batch.length} message screenshots${lastCharacterName ? ` for ${lastCharacterName}` : ''}${skipped}`,
          characterName: lastCharacterName,
        });
        setCaption('');
      }

      if (errors.length) {
        onError?.(
          saved > 0
            ? `${saved} saved; ${errors.length} failed — ${errors[0]}`
            : errors[0] ?? 'Upload failed',
        );
      }
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
      <p className="text-xs text-white/55 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        Upload DM / chat screenshots (multi-select OK) — we extract the conversation and save it to the right person.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void uploadMany(files);
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
        {uploading ? progress ?? 'Analyzing…' : 'Upload message screenshots'}
      </Button>
    </div>
  );
}
