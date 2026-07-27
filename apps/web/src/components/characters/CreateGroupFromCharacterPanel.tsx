import { useState } from 'react';
import { Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';

import { Button } from '../ui/button';
import { openCreateGroupFromCharacterChat } from '../../lib/openCreateGroupFromCharacterChat';

type CharacterSeed = {
  id: string;
  name: string;
  role?: string | null;
  archetype?: string | null;
};

type Props = {
  character: CharacterSeed;
  isSelf?: boolean;
  onOpenedChat: () => void;
  testIdPrefix?: string;
  accentClassName?: string;
};

/**
 * One-click bridge: leave the character modal and create the missing group
 * in main chat (focused chip + extraction / lore distribution).
 */
export function CreateGroupFromCharacterPanel({
  character,
  isSelf = false,
  onOpenedChat,
  testIdPrefix = 'create-group',
  accentClassName = 'border-primary/25 bg-primary/5',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const who = isSelf ? 'you' : character.name;

  const handleTalkInChat = () => {
    setBusy(true);
    setError(null);
    try {
      openCreateGroupFromCharacterChat({
        character,
        isSelf,
      });
      onOpenedChat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open chat.');
      setBusy(false);
    }
  };

  return (
    <div
      className={`mt-3 rounded-lg border p-3 space-y-2 ${accentClassName}`}
      data-testid={`${testIdPrefix}-panel`}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-300/80" aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-white/80">Group doesn’t exist yet?</p>
          <p className="text-[10px] text-white/45 leading-snug">
            Create it in main chat — LoreBook will set up the Groups &amp; Organizations entity,
            classify it from what you say, link {who}, and file related lore wherever else it belongs.
          </p>
        </div>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <Button
        type="button"
        size="sm"
        className="h-8 w-full text-xs sm:w-auto"
        disabled={busy}
        onClick={handleTalkInChat}
        data-testid={`${testIdPrefix}-submit`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
        )}
        Talk in main chat
      </Button>
    </div>
  );
}
