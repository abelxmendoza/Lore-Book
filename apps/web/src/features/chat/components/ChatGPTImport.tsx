import { FileArchive, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';

interface ChatGPTImportProps {
  onImportComplete?: (stats: { factsAdded: number; contradictionsFound: number; verified: number }) => void;
  onImportError?: (error: string) => void;
}

/**
 * Compact composer entry point for the canonical ChatGPT Lore Migration.
 * Import processing lives in Account → Data & Export so every source uses the
 * same inventory, privacy, provenance, batching, and Memory Review gates.
 */
export const ChatGPTImport = (_props: ChatGPTImportProps) => {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
      <div className="flex items-start gap-3">
        <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">Import your ChatGPT lore</p>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Upload the official ChatGPT export, choose conversations, and review every proposed
            belief before it becomes part of LoreBook.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300/70">
            <ShieldCheck className="h-3.5 w-3.5" />
            Assistant claims are excluded from autobiographical authority.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/account?tab=data')}
            className="mt-3"
          >
            Open ChatGPT Lore Migration
          </Button>
        </div>
      </div>
    </div>
  );
};
