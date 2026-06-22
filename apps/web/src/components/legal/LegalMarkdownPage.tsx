import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, FileText } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';

type LegalMarkdownPageProps = {
  title: string;
  markdownPath: '/api/legal/terms' | '/api/legal/privacy';
  siblingLabel: string;
  siblingPath: '/terms' | '/privacy-policy';
};

export function LegalMarkdownPage({
  title,
  markdownPath,
  siblingLabel,
  siblingPath,
}: LegalMarkdownPageProps) {
  const navigate = useNavigate();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${markdownPath}?format=md`, {
          headers: { Accept: 'text/markdown' },
        });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const text = await res.text();
        if (!cancelled) setMarkdown(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load document');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markdownPath]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-6 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <FileText className="h-7 w-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            {title}
          </h1>
          <p className="text-white/60 text-sm">Effective June 21, 2026 · LoreBook · lorebookai.com</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="border-border/60 bg-white/5 hover:bg-white/10 text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to App
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(siblingPath)}
              className="border-border/60 bg-white/5 hover:bg-white/10 text-white"
            >
              {siblingLabel}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 sm:p-8">
          {error && <p className="text-red-300 text-sm">{error}</p>}
          {!error && !markdown && <p className="text-white/50 text-sm">Loading…</p>}
          {markdown && (
            <article className="legal-markdown prose prose-invert prose-purple max-w-none text-white/85 leading-relaxed [&_h1]:hidden [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white/95 [&_h3]:mt-5 [&_h3]:mb-2 [&_p]:text-white/80 [&_li]:text-white/80 [&_a]:text-purple-300 [&_a:hover]:underline [&_strong]:text-white [&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:text-white [&_td]:align-top [&_th]:border [&_td]:border [&_th]:border-white/10 [&_td]:border-white/10 [&_th]:p-2 [&_td]:p-2">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </article>
          )}
        </div>

        <div className="pt-4 border-t border-white/10 text-center">
          <Logo size="md" showText />
          <p className="text-sm text-white/50 mt-3">© Abel Mendoza — Omega Technologies</p>
        </div>
      </div>
    </div>
  );
}
