import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, MessageCircle, UserPlus, type LucideIcon } from 'lucide-react';

import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';

export type FocusedEntityOption = {
  id: string;
  name: string;
  aliases?: string[];
};

export type FocusedEntityLauncherTheme = {
  collapsedBorder: string;
  collapsedBg: string;
  expandedBorder: string;
  expandedBg: string;
  iconWrap: string;
  iconClass: string;
  ctaClass: string;
  inputClass: string;
  matchHover: string;
  matchMeta: string;
};

export type FocusedEntityLauncherCopy = {
  collapsedTitle: string;
  collapsedBody: string;
  ctaLabel: string;
  expandedTitle: string;
  expandedBody: string;
  namePlaceholder: string;
  nameAriaLabel: string;
  matchListAriaLabel: string;
  inBookLabel: string;
  footerNote: string;
  introduceVerb?: string;
};

type Props = {
  options: FocusedEntityOption[];
  copy: FocusedEntityLauncherCopy;
  theme: FocusedEntityLauncherTheme;
  icon: LucideIcon;
  busy?: boolean;
  error?: string | null;
  onContinue: (selection: { name: string; entity?: FocusedEntityOption }) => void | Promise<void>;
  /** Optional extra controls under the name field (e.g. romance sex filter). */
  filters?: ReactNode;
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function FocusedEntityChatLauncher({
  options,
  copy,
  theme,
  icon: Icon,
  busy = false,
  error,
  onContinue,
  filters,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const query = normalized(name);

  const exactMatch = useMemo(
    () =>
      options.find((option) =>
        [option.name, ...(option.aliases ?? [])].some(
          (candidate) => normalized(candidate) === query,
        ),
      ),
    [options, query],
  );

  const matches = useMemo(() => {
    if (!query) return options.slice(0, 5);
    return options
      .filter((option) =>
        [option.name, ...(option.aliases ?? [])].some((candidate) =>
          normalized(candidate).includes(query),
        ),
      )
      .slice(0, 5);
  }, [options, query]);

  const continueToChat = async (entity?: FocusedEntityOption) => {
    const resolvedName = entity?.name ?? name.trim();
    if (!resolvedName || busy) return;
    await onContinue({ name: resolvedName, entity });
  };

  if (!expanded) {
    return (
      <Card className={`overflow-hidden ${theme.collapsedBorder} ${theme.collapsedBg}`}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl border p-2.5 ${theme.iconWrap}`}>
              <MessageCircle className={`h-5 w-5 ${theme.iconClass}`} />
            </div>
            <div>
              <p className="font-medium text-white">{copy.collapsedTitle}</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/55 sm:text-sm">
                {copy.collapsedBody}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setExpanded(true)}
            className={`shrink-0 text-white ${theme.ctaClass}`}
          >
            <Icon className="mr-2 h-4 w-4" />
            {copy.ctaLabel}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden ${theme.expandedBorder} ${theme.expandedBg}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-medium text-white">
              <Icon className={`h-4 w-4 ${theme.iconClass}`} />
              {copy.expandedTitle}
            </p>
            <p className="mt-1 text-xs text-white/55">{copy.expandedBody}</p>
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
            placeholder={copy.namePlaceholder}
            aria-label={copy.nameAriaLabel}
            autoFocus
            autoComplete="off"
            className={theme.inputClass}
          />

          {filters}

          {matches.length > 0 && (
            <div
              className="rounded-lg border border-white/10 bg-black/25 p-1"
              aria-label={copy.matchListAriaLabel}
            >
              {matches.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void continueToChat(option)}
                  disabled={busy}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-white/80 disabled:opacity-50 ${theme.matchHover}`}
                >
                  <span className="min-w-0 truncate">{option.name}</span>
                  <span className={`flex shrink-0 items-center gap-1 text-[11px] ${theme.matchMeta}`}>
                    {copy.inBookLabel}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-white/40">{copy.footerNote}</p>
            <Button
              type="submit"
              disabled={!name.trim() || busy}
              className={`shrink-0 text-white ${theme.ctaClass}`}
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
                  : `${copy.introduceVerb ?? 'Introduce'} ${name.trim() || 'them'} in chat`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
