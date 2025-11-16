import { useState, type ChangeEvent } from 'react';
import { Sparkles } from 'lucide-react';

import type { Chapter } from '../hooks/useLoreKeeper';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

export type JournalComposerProps = {
  onSave: (content: string, options?: { chapterId?: string | null; metadata?: Record<string, unknown> }) => Promise<void>;
  onAsk: (content: string) => Promise<void>;
  onVoiceUpload?: (file: File) => Promise<void>;
  loading?: boolean;
  chapters?: Chapter[];
};

const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...Array.from(new Uint8Array(buffer))));

const encryptText = async (content: string, passphrase: string) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(passphrase));
  const key = await crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(content));
  return { cipher: toBase64(cipherBuffer), iv: toBase64(iv.buffer) };
};

export const JournalComposer = ({ onSave, onAsk, onVoiceUpload, loading, chapters = [] }: JournalComposerProps) => {
  const [value, setValue] = useState('');
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState('');

  const handleSave = async () => {
    if (!value.trim()) return;
    let content = value.trim();
    let metadata: Record<string, unknown> | undefined;

    if (encrypt && passphrase.trim()) {
      const encrypted = await encryptText(content, passphrase.trim());
      content = `enc:${encrypted.cipher}`;
      metadata = { encrypted: true, iv: encrypted.iv, algorithm: 'AES-GCM' };
    }

    await onSave(content, { chapterId, metadata });
    setValue('');
    setChapterId(null);
    setEncrypt(false);
    setPassphrase('');
  };

  const handleAsk = async () => {
    if (!value.trim()) return;
    await onAsk(value.trim());
  };

  const handleVoiceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length || !onVoiceUpload) return;
    const file = event.target.files[0];
    await onVoiceUpload(file);
    event.target.value = '';
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-black/40 p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-techno text-sm uppercase tracking-[0.5em] text-white/60">New Memory</h3>
        <span className="text-xs text-white/40">Auto-save keywords: log, update, chapter…</span>
      </div>
      <Textarea
        placeholder="Log your mission, feelings, or milestones…"
        className="mt-4"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
        <label className="font-semibold uppercase tracking-[0.3em] text-white/40">Chapter</label>
        <select
          className="rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-sm text-white"
          value={chapterId ?? ''}
          onChange={(event) => setChapterId(event.target.value || null)}
        >
          <option value="">Unassigned</option>
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
        <label className="font-semibold uppercase tracking-[0.3em] text-white/40">Encrypt</label>
        <input
          type="checkbox"
          checked={encrypt}
          onChange={(event) => setEncrypt(event.target.checked)}
          className="h-4 w-4 rounded border-border/50 bg-black/60"
        />
        {encrypt && (
          <input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            className="rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-sm text-white"
          />
        )}
        {onVoiceUpload && (
          <label className="ml-auto cursor-pointer rounded-lg border border-dashed border-primary/50 px-3 py-2 text-primary/80">
            Upload voice log
            <input type="file" accept="audio/*" className="hidden" onChange={handleVoiceUpload} />
          </label>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={!value.trim()}>
          Save to Lore
        </Button>
        <Button variant="ghost" onClick={handleAsk} disabled={!value.trim() || loading} leftIcon={<Sparkles className="h-4 w-4 text-primary" />}>
          Ask Lore Keeper
        </Button>
      </div>
    </div>
  );
};
