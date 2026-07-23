import { useMemo, useState } from 'react';
import { ArrowRight, Heart, MessageCircle, UserPlus } from 'lucide-react';

import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';

export type RomanticInterestCharacterOption = {
  id: string;
  name: string;
  aliases?: string[];
  sex?: string | null;
};

type SexFilter = 'all' | 'male' | 'female';

const SEX_FILTER_OPTIONS: Array<{ value: SexFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

type Props = {
  characters: RomanticInterestCharacterOption[];
  busy?: boolean;
  error?: string | null;
  onContinue: (selection: { name: string; character?: RomanticInterestCharacterOption }) => void | Promise<void>;
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function RomanticInterestChatLauncher({
  characters,
  busy = false,
  error,
  onContinue,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [sexFilter, setSexFilter] = useState<SexFilter>('all');
  const query = normalized(name);

  const filteredCharacters = useMemo(
    () => (sexFilter === 'all' ? characters : characters.filter((character) => character.sex === sexFilter)),
    [characters, sexFilter],
  );

  const exactMatch = useMemo(
    () =>
      filteredCharacters.find((character) =>
        [character.name, ...(character.aliases ?? [])].some(
          (candidate) => normalized(candidate) === query,
        ),
      ),
    [filteredCharacters, query],
  );

  const matches = useMemo(() => {
    if (!query) return filteredCharacters.slice(0, 5);
    return filteredCharacters
      .filter((character) =>
        [character.name, ...(character.aliases ?? [])].some((candidate) =>
          normalized(candidate).includes(query),
        ),
      )
      .slice(0, 5);
  }, [filteredCharacters, query]);

  const continueToChat = async (character?: RomanticInterestCharacterOption) => {
    const resolvedName = character?.name ?? name.trim();
    if (!resolvedName || busy) return;
    await onContinue({ name: resolvedName, character });
  };

  if (!expanded) {
    return (
      <Card className="overflow-hidden border-pink-500/30 bg-gradient-to-r from-pink-950/30 via-purple-950/20 to-black/30">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-pink-400/25 bg-pink-500/10 p-2.5 text-pink-300">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-white">Someone new on your mind?</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/55 sm:text-sm">
                Start a focused chat. Choose someone already in Character Book or create a new
                character, then LoreBook will attach their chip and grow their context as you talk.
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 bg-pink-600 text-white hover:bg-pink-500"
          >
            <Heart className="mr-2 h-4 w-4" />
            Add a new romantic interest
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-pink-400/40 bg-gradient-to-br from-pink-950/35 via-purple-950/25 to-black/40">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-medium text-white">
              <Heart className="h-4 w-4 text-pink-300" />
              Add a new romantic interest
            </p>
            <p className="mt-1 text-xs text-white/55">
              Search Character Book first, or enter a new person to introduce them in chat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setName('');
            }}
            className="text-xs text-white/45 hover:text-white/75"
          >
            Cancel
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void continueToChat(exactMatch);
          }}
          className="space-y-3"
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Their name"
            aria-label="Romantic interest name"
            autoFocus
            autoComplete="off"
            className="border-pink-500/25 bg-black/40 text-white placeholder:text-white/35"
          />

          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by sex">
            {SEX_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sexFilter === option.value}
                onClick={() => setSexFilter(option.value)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  sexFilter === option.value
                    ? 'border-pink-400/50 bg-pink-500/20 text-pink-100'
                    : 'border-white/10 text-white/45 hover:text-white/75'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {matches.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-black/25 p-1" aria-label="Character Book matches">
              {matches.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => void continueToChat(character)}
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-pink-500/10 hover:text-white disabled:opacity-50"
                >
                  <span className="min-w-0 truncate">{character.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-pink-200/65">
                    In Character Book
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-white/40">
              Nothing is assumed about their feelings. You decide what becomes part of the story.
            </p>
            <Button
              type="submit"
              disabled={!name.trim() || busy}
              className="shrink-0 bg-pink-600 text-white hover:bg-pink-500"
            >
              {exactMatch ? (
                <MessageCircle className="mr-2 h-4 w-4" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {busy
                ? 'Opening chat…'
                : exactMatch
                  ? `Chat about ${exactMatch.name}`
                  : `Introduce ${name.trim() || 'them'} in chat`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
