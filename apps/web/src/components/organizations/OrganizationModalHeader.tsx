import { useEffect, useRef, useState } from 'react';
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  Loader2,
  MapPin,
  MessageSquare,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { EditableEntityName } from '../common/EditableEntityName';
import type { Organization } from './OrganizationProfileCard';
import {
  formatRelationship,
  getOrgCategoryTheme,
  getOrgTypeColor,
  getOrgTypeLabel,
  getRelationshipBadgeClass,
} from '../../lib/organizationModalTheme';
import { cn } from '../../lib/cn';
import { EntityLorebookCompileControl } from '../lorebook/EntityLorebookCompileControl';
import { OrganizationImportanceBadge } from './OrganizationImportanceBadge';

function formatSince(org: Organization): string | null {
  if (org.founded_date) {
    const d = new Date(org.founded_date);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  if (org.founded_year) return String(org.founded_year);
  if (org.created_at) {
    const d = new Date(org.created_at);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return null;
}

/**
 * Entity types a misfiled group can be moved to. Target books apply their
 * own admission rules server-side (see reclassifyOrganizationService).
 */
const RECLASSIFY_OPTIONS: Array<{ value: string; label: string; hint: string; icon: LucideIcon }> = [
  { value: 'character', label: 'Person / Character', hint: 'A person who belongs in Characters', icon: User },
  { value: 'location',  label: 'Location / Place',    hint: 'Checked against Places rules first',  icon: MapPin },
  { value: 'project',   label: 'Project',             hint: 'Checked against Projects rules first', icon: Briefcase },
  { value: 'skill',     label: 'Skill',                hint: 'An ability or craft',                  icon: Award },
  { value: 'event',     label: 'Event',                hint: 'A happening — moves to the Events book', icon: Calendar },
];

export type ReclassifyState = {
  busy: boolean;
  success: boolean;
  error: string | null;
  target: string;
  onSelect: (value: string) => void;
  /** Called when the menu is toggled — lets the modal clear a stale error. */
  onOpenMenu: () => void;
};

/**
 * Entity type switcher (header control). The single place to move a
 * misclassified group into the book it actually belongs in.
 */
const EntityTypeSwitcher = ({ busy, success, error, target, onSelect, onOpenMenu }: ReclassifyState) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const successLabel = RECLASSIFY_OPTIONS.find((o) => o.value === target)?.label ?? target;

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Tooltip content="Wrong book? Click to move this to Person, Place, Project, Skill, or Event. Existing matches are merged.">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); onOpenMenu(); }}
          disabled={busy || success}
          aria-haspopup="menu"
          aria-expanded={open ? 'true' : 'false'}
          aria-label="Reclassify entity type (if in wrong book)"
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-60 shadow-sm',
            success
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/15 hover:text-white hover:border-white/30'
          )}
        >
          {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Building2 className="h-2.5 w-2.5" />}
          {success ? `Moved to ${successLabel} ✓` : 'Group'}
          {!success && <ChevronDown className="h-2.5 w-2.5 opacity-70" />}
        </button>
      </Tooltip>
      {open && !success && (
        <div
          role="menu"
          aria-label="Change entity type"
          className="absolute left-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-zinc-900/95 backdrop-blur-sm shadow-xl p-1"
        >
          <p className="px-2 pt-1.5 pb-2 text-[9px] text-white/50">
            Move to the correct book. If it already exists there, we merge.
          </p>
          {RECLASSIFY_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onSelect(option.value); }}
                disabled={busy}
                className="w-full flex items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/[0.08] disabled:opacity-50"
              >
                <OptionIcon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-white/50" />
                <span className="min-w-0">
                  <span className="block text-xs text-white/85 font-medium">{option.label}</span>
                  <span className="block text-[10px] text-white/40 leading-tight">{option.hint}</span>
                </span>
                {busy && target === option.value && (
                  <Loader2 className="h-3 w-3 ml-auto mt-1 animate-spin text-white/60" />
                )}
              </button>
            );
          })}
          {error && (
            <p className="px-2 py-1.5 text-[10px] text-red-400 border-t border-white/10 mt-1">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

type Props = {
  organization: Organization;
  memberCount: number;
  onClose: () => void;
  onOpenChat: () => void;
  /** Persist a new display name (inline pencil in the header). */
  onRename?: (nextName: string) => Promise<void> | void;
  /** Disable rename (e.g. ephemeral / unsaved demo cards). */
  renameDisabled?: boolean;
  /** Wrong book? Lets the user move this group to Person, Place, Project, Skill, or Event. */
  reclassify?: ReclassifyState;
};

export function OrganizationModalHeader({
  organization,
  memberCount,
  onClose,
  onOpenChat,
  onRename,
  renameDisabled = false,
  reclassify,
}: Props) {
  const theme = getOrgCategoryTheme(organization);
  const since = formatSince(organization);
  const showReclassify = Boolean(reclassify) && !renameDisabled;
  const importanceScore = organization.analytics?.importance_score;

  return (
    <div
      className={cn(
        'flex-shrink-0 border-b border-white/8 bg-gradient-to-br px-3 py-2 sm:px-4 sm:py-2.5',
        theme.bg
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn('shrink-0 rounded-lg border p-1.5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.5)]', theme.iconBg)}>
          <Building2 className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', theme.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 pr-1">
              {onRename ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <EditableEntityName
                    name={organization.name}
                    onSave={onRename}
                    disabled={renameDisabled}
                    label="group name"
                    className="text-sm sm:text-base font-bold text-white leading-tight break-words"
                    inputClassName="min-w-0 w-full max-w-full rounded-md border border-primary/40 bg-black/70 px-2 py-1 text-sm sm:text-base font-bold text-white outline-none focus:border-primary/70 shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                  />
                  {showReclassify && <EntityTypeSwitcher {...reclassify!} />}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-white leading-tight break-words pr-1">
                    {organization.name}
                  </h2>
                  {showReclassify && <EntityTypeSwitcher {...reclassify!} />}
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="shrink-0 h-7 w-7 p-0 -mr-1 -mt-0.5">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 leading-4', getOrgTypeColor(organization.type))}>
              {getOrgTypeLabel(organization.group_type ?? organization.type)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] px-1.5 py-0 leading-4',
                organization.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-white/10 text-white/45 border-white/20'
              )}
            >
              {organization.status === 'active' ? 'Active' : organization.status}
            </Badge>
            {organization.user_relationship && (
              <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 leading-4 capitalize', getRelationshipBadgeClass(organization.user_relationship))}>
                {formatRelationship(organization.user_relationship)}
              </Badge>
            )}
            {importanceScore != null && (
              <OrganizationImportanceBadge
                size="sm"
                score={importanceScore}
              />
            )}
            {since && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 leading-4 bg-white/5 text-white/45 border-white/15">
                Since {since}
              </Badge>
            )}
          </div>
          {organization.description && (
            <p className="mt-1 text-[11px] sm:text-xs text-white/50 line-clamp-2 sm:line-clamp-1 leading-snug">{organization.description}</p>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex flex-1 min-w-0 items-center gap-1">
          <StatPill label="Members" value={String(memberCount)} />
          {organization.usage_count > 0 && (
            <StatPill label="Mentions" value={`${organization.usage_count}`} />
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <EntityLorebookCompileControl
            subjectLabel={organization.name}
            focus={{ organizationId: organization.id, themes: organization.name }}
            testId="org-modal-lorebook-compile"
            className="!py-0.5 !pl-1.5 !pr-1.5 scale-[0.92] origin-right"
          />
          <button
            type="button"
            onClick={onOpenChat}
            aria-label="Chat about this group"
            className="inline-flex items-center gap-1 rounded-lg border border-primary/35 bg-primary/20 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-primary/30 touch-manipulation"
          >
            <MessageSquare className="h-3 w-3" />
            <span className="hidden xs:inline sm:inline">Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  suffix,
  className,
}: {
  label: string;
  value: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-baseline gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5',
        className
      )}
    >
      <span className="text-[9px] uppercase tracking-wide text-white/35 truncate">{label}</span>
      <span className="text-xs font-bold tabular-nums text-white leading-none">
        {value}
        {suffix && <span className="text-[9px] font-normal text-white/35">{suffix}</span>}
      </span>
    </div>
  );
}
