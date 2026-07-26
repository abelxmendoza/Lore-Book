import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';

import { Button } from '../ui/button';
import { OrganizationMemberRoleSelect } from '../ui/OrganizationMemberRoleSelect';
import { CANONICAL_GROUP_TYPES, GROUP_TYPE_LABELS } from '../../lib/groupTypes';
import { inferGroupTypeFromContext } from '../../lib/inferGroupTypeFromContext';
import { openCreateGroupFromCharacterChat } from '../../lib/openCreateGroupFromCharacterChat';
import type { GroupType } from '../organizations/OrganizationProfileCard';

type CharacterSeed = {
  id: string;
  name: string;
  role?: string | null;
  archetype?: string | null;
};

type Props = {
  character: CharacterSeed;
  isSelf?: boolean;
  /** Prefill member role from the existing add-membership role field when present. */
  defaultMemberRole?: string;
  onOpenedChat: () => void;
  testIdPrefix?: string;
  accentClassName?: string;
};

export function CreateGroupFromCharacterPanel({
  character,
  isSelf = false,
  defaultMemberRole = '',
  onOpenedChat,
  testIdPrefix = 'create-group',
  accentClassName = 'border-primary/25 bg-primary/5',
}: Props) {
  const [groupName, setGroupName] = useState('');
  const [details, setDetails] = useState('');
  const [memberRole, setMemberRole] = useState(defaultMemberRole);
  const [groupTypeOverride, setGroupTypeOverride] = useState<GroupType | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMemberRole(defaultMemberRole);
  }, [defaultMemberRole]);

  const inferred = useMemo(
    () =>
      inferGroupTypeFromContext({
        groupName,
        details,
        characterRole: character.role,
        characterArchetype: character.archetype,
        memberRole,
      }),
    [groupName, details, character.role, character.archetype, memberRole],
  );

  const effectiveType = groupTypeOverride || inferred.groupType;

  const handleCreateInChat = () => {
    const name = groupName.trim();
    if (!name) {
      setError('Enter a group or organization name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      openCreateGroupFromCharacterChat({
        groupName: name,
        details,
        character,
        memberRole: memberRole.trim() || undefined,
        groupTypeOverride: groupTypeOverride || null,
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
            classify it from your details, and link {isSelf ? 'you' : character.name}.
          </p>
        </div>
      </div>

      <input
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        placeholder="New group or organization name"
        aria-label="New group or organization name"
        data-testid={`${testIdPrefix}-name`}
        className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-primary/60 focus:outline-none"
      />

      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="What is it? Workplace, friend circle, family, crew… any story context helps classification."
        aria-label="Details for new group"
        data-testid={`${testIdPrefix}-details`}
        rows={3}
        className="w-full resize-y rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-primary/60 focus:outline-none"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-white/40">Suggested type</span>
          <select
            value={groupTypeOverride}
            onChange={(e) => setGroupTypeOverride((e.target.value || '') as GroupType | '')}
            aria-label="Group type"
            data-testid={`${testIdPrefix}-type`}
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none"
          >
            <option value="">
              Auto · {GROUP_TYPE_LABELS[inferred.groupType]} ({Math.round(inferred.confidence * 100)}%)
            </option>
            {CANONICAL_GROUP_TYPES.map((type) => (
              <option key={type} value={type}>
                {GROUP_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-white/40">
            {isSelf ? 'Your role' : `${character.name}'s role`}
          </span>
          <OrganizationMemberRoleSelect
            value={memberRole}
            onChange={setMemberRole}
            disabled={busy}
            data-testid={`${testIdPrefix}-member-role`}
          />
        </label>
      </div>

      {groupName.trim() ? (
        <p className="text-[10px] text-white/40" data-testid={`${testIdPrefix}-hint`}>
          Will seed chat as <span className="text-white/65">{GROUP_TYPE_LABELS[effectiveType]}</span>
          {!groupTypeOverride && inferred.reasons[0] ? ` · ${inferred.reasons[0]}` : null}
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <Button
        type="button"
        size="sm"
        className="h-8 w-full text-xs sm:w-auto"
        disabled={busy || !groupName.trim()}
        onClick={handleCreateInChat}
        data-testid={`${testIdPrefix}-submit`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
        )}
        Create in chat
      </Button>
    </div>
  );
}
