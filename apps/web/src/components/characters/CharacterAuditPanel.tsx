import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  GitMerge,
  Lock,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { invalidateCache } from '../../lib/requestCache';
import { invalidateEntityTags } from '../../store/invalidateEntityCache';
import {
  characterCardAuditApi,
  type CharacterCardAuditReport,
  type CharacterCardAuditResult,
  type CharacterAuditStatus,
} from '../../api/characterCardAudit';
import {
  CHARACTER_AUDIT_STATUS_LABEL,
  buildCharacterCardAuditClipboardText,
  characterAuditSuggestedFix,
} from '../../lib/characterCardAuditClipboard';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { cn } from '../../lib/utils';

type Props = {
  demoMode?: boolean;
  onChanged?: () => void;
};

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const STATUS_LABEL = CHARACTER_AUDIT_STATUS_LABEL;

const WRONG_DOMAIN_TONE = 'text-orange-200 border-orange-500/30 bg-orange-500/10';

const STATUS_TONE: Record<CharacterAuditStatus, string> = {
  valid_identity: 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10',
  valid_contextual_reference: 'text-teal-200 border-teal-500/30 bg-teal-500/10',
  contextual_character_needs_context: 'text-amber-200 border-amber-500/30 bg-amber-500/10',
  needs_context: 'text-amber-200 border-amber-500/30 bg-amber-500/10',
  wrong_domain: WRONG_DOMAIN_TONE,
  wrong_domain_tool: WRONG_DOMAIN_TONE,
  wrong_domain_media: WRONG_DOMAIN_TONE,
  wrong_domain_band: WRONG_DOMAIN_TONE,
  wrong_domain_role: WRONG_DOMAIN_TONE,
  wrong_domain_event: WRONG_DOMAIN_TONE,
  wrong_domain_process: WRONG_DOMAIN_TONE,
  wrong_domain_organization: WRONG_DOMAIN_TONE,
  sentence_bleed: 'text-red-200 border-red-500/30 bg-red-500/10',
  pronoun_fragment: 'text-red-200 border-red-500/30 bg-red-500/10',
  broken_span: 'text-violet-200 border-violet-500/30 bg-violet-500/10',
  duplicate_or_merge_candidate: 'text-fuchsia-200 border-fuchsia-500/30 bg-fuchsia-500/10',
  junk_test_data: 'text-red-200 border-red-500/30 bg-red-500/10',
  bare_title_invalid: 'text-red-200 border-red-500/30 bg-red-500/10',
  needs_identity_resolution: 'text-sky-200 border-sky-500/30 bg-sky-500/10',
};

function isActionable(result: CharacterCardAuditResult): boolean {
  if (result.recommendedAction === 'keep' && result.status === 'valid_identity') return false;
  if (result.recommendedAction === 'keep' && result.status === 'valid_contextual_reference') return false;
  return true;
}

export function CharacterAuditPanel({ demoMode = false, onChanged }: Props) {
  const [report, setReport] = useState<CharacterCardAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [renameDraft, setRenameDraft] = useState<{ id: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadReport = useCallback(async () => {
    if (demoMode) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await characterCardAuditApi.get();
      setReport(next);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load character audit'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleCopyAll = async () => {
    if (!report) return;
    const ok = await copyTextToClipboard(buildCharacterCardAuditClipboardText(report, visibleResults));
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const actionableResults = useMemo(() => {
    if (!report) return [];
    return (report.results ?? []).filter((r) => isActionable(r) && !dismissed.has(r.characterId));
  }, [report, dismissed]);

  const visibleResults = useMemo(() => {
    if (!report) return [];
    return (report.results ?? []).filter((r) => !dismissed.has(r.characterId));
  }, [report, dismissed]);

  const issueCount = actionableResults.length;
  const healthy = !loading && issueCount === 0;

  const afterChange = async (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 12000);
    invalidateCache();
    invalidateEntityTags(['Character']);
    await loadReport();
    onChanged?.();
  };

  const lockTitle = async (result: CharacterCardAuditResult) => {
    setBusyId(result.characterId);
    setError(null);
    try {
      await fetchJson(`/api/characters/${result.characterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          metadata: {
            card_audit_review: {
              action: 'lock',
              lockedTitle: result.currentTitle,
              reviewedAt: new Date().toISOString(),
            },
          },
        }),
      });
      setDismissed((prev) => new Set(prev).add(result.characterId));
      await afterChange(`Locked title for ${result.currentTitle}.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to lock title'));
    } finally {
      setBusyId(null);
    }
  };

  const keepCard = async (result: CharacterCardAuditResult) => {
    setBusyId(result.characterId);
    setError(null);
    try {
      const res = await characterCardAuditApi.resolveKeep(result.characterId);
      if (!res.success) {
        throw new Error('Could not save your keep decision');
      }
      setDismissed((prev) => new Set(prev).add(result.characterId));
      await afterChange(`Kept ${result.currentTitle} as-is — rescan will not flag it again.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to mark card as kept'));
    } finally {
      setBusyId(null);
    }
  };

  const renameCard = async (result: CharacterCardAuditResult, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === result.currentTitle) return;
    setBusyId(result.characterId);
    setError(null);
    try {
      const alias = result.aliasToAdd
        ? Array.from(new Set([...(result.aliasToAdd ? [result.aliasToAdd] : []), result.currentTitle]))
        : undefined;
      await fetchJson(`/api/characters/${result.characterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmed,
          ...(alias ? { alias } : {}),
          metadata: {
            card_audit_review: {
              action: 'rename',
              from: result.currentTitle,
              to: trimmed,
              reviewedAt: new Date().toISOString(),
            },
          },
        }),
      });
      setRenameDraft(null);
      await afterChange(`Renamed "${result.currentTitle}" → "${trimmed}".`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to rename character'));
    } finally {
      setBusyId(null);
    }
  };

  const mergeCard = async (result: CharacterCardAuditResult, targetId: string) => {
    setBusyId(result.characterId);
    setError(null);
    try {
      await fetchJson('/api/characters/merge', {
        method: 'POST',
        body: JSON.stringify({
          source_id: result.characterId,
          target_id: targetId,
          reason: `Character card audit: ${result.reason}`,
        }),
      });
      await afterChange(`Merged ${result.currentTitle} into target card.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to merge characters'));
    } finally {
      setBusyId(null);
    }
  };

  const deleteCard = async (result: CharacterCardAuditResult) => {
    if (!window.confirm(`Permanently delete "${result.currentTitle}"? Prefer archive unless you are sure.`)) return;
    setBusyId(result.characterId);
    setError(null);
    try {
      await fetchJson(`/api/characters/${result.characterId}?redistribute=true`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'character_card_audit_cleanup' }),
      });
      await afterChange(`Removed ${result.currentTitle}. Evidence is being reprocessed.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete character'));
    } finally {
      setBusyId(null);
    }
  };

  const markWrongDomain = async (result: CharacterCardAuditResult) => {
    setBusyId(result.characterId);
    setError(null);
    try {
      await fetchJson(`/api/characters/${result.characterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'archived',
          metadata: {
            card_audit_review: {
              action: result.recommendedAction,
              wrongDomainTarget: result.wrongDomainTarget,
              reviewedAt: new Date().toISOString(),
            },
          },
        }),
      });
      const label =
        result.recommendedAction === 'move_to_group'
          ? 'group'
          : result.recommendedAction === 'move_to_interest'
            ? 'interest'
            : 'non-character';
      await afterChange(
        `Archived ${result.currentTitle} — flagged for ${label}. Create the correct entity in the right book when ready.`
      );
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to archive card'));
    } finally {
      setBusyId(null);
    }
  };

  if (demoMode) return null;

  return (
    <>
      {!healthy && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 overflow-hidden">
          <div className="flex items-start gap-2 px-3 sm:px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5 text-amber-200" />
                  Character card audit
                </h3>
                {loading ? (
                  <span className="text-[10px] text-white/40">Scanning…</span>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-amber-200 border-amber-500/30">
                    {issueCount} card{issueCount === 1 ? '' : 's'} need attention
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
                Ambiguous people are fine with story context — generic labels, junk, and wrong-domain cards should be
                cleaned up.
              </p>
            </div>
            <Button size="sm" variant="outline" className="text-xs flex-shrink-0" onClick={() => setShowPanel(true)}>
              Review audit
            </Button>
          </div>
        </div>
      )}

      {healthy && report && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/15 px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <p className="text-[11px] text-white/55 flex-1">
            Character cards pass identity audit — no ambiguous or wrong-domain fixes pending.
          </p>
          <button
            type="button"
            onClick={() => setShowPanel(true)}
            className="text-[10px] text-white/40 hover:text-white/70 underline"
          >
            View full report
          </button>
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      )}

      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-6xl rounded-xl border border-white/10 bg-neutral-950 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Character card audit</h3>
                <p className="text-xs text-white/50">
                  Review titles, provenance, and suggested fixes. Your choice overrides inference.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyAll()}
                  disabled={!report || visibleResults.length === 0}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
                    copied
                      ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                      : 'border-white/10 text-white/60 hover:text-white hover:border-white/25',
                  )}
                  title="Copy all character card audit rows as plain text"
                  aria-label="Copy all character card audit"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy all'}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
                  onClick={() => void loadReport()}
                  disabled={loading}
                >
                  Refresh
                </Button>
                <button
                  type="button"
                  onClick={() => setShowPanel(false)}
                  className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/5"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-auto flex-1 space-y-4">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {error}
                </div>
              )}

              {report && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  {Object.entries(report.summary ?? {})
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => (
                      <div
                        key={status}
                        className={`rounded-md border px-2 py-1.5 ${STATUS_TONE[status as CharacterAuditStatus]}`}
                      >
                        <span className="font-medium">{STATUS_LABEL[status as CharacterAuditStatus]}</span>
                        <span className="ml-1 opacity-70">({count})</span>
                      </div>
                    ))}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-white/50 uppercase tracking-wide text-[10px]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Current title</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                      <th className="px-3 py-2 font-medium">Suggested fix</th>
                      <th className="px-3 py-2 font-medium">Provenance</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visibleResults.map((result) => {
                      const busy = busyId === result.characterId;
                      const editing = renameDraft?.id === result.characterId;
                      return (
                        <tr key={result.characterId} className="align-top hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5 font-medium text-white">{result.currentTitle}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${STATUS_TONE[result.status]}`}
                            >
                              {STATUS_LABEL[result.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-white/65 max-w-[22rem] whitespace-pre-wrap break-words leading-relaxed">
                            {result.reason}
                          </td>
                          <td className="px-3 py-2.5 text-white/75 max-w-[16rem] whitespace-pre-wrap break-words leading-relaxed">
                            {editing ? (
                              <input
                                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-white"
                                aria-label="New card title"
                                value={renameDraft.value}
                                onChange={(e) => setRenameDraft({ id: result.characterId, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void renameCard(result, renameDraft.value);
                                }}
                              />
                            ) : (
                              characterAuditSuggestedFix(result)
                            )}
                          </td>
                          <td
                            className="px-3 py-2.5 text-white/70 min-w-[20rem] w-[38%] whitespace-pre-wrap break-words leading-relaxed"
                            data-testid="character-audit-provenance"
                          >
                            {result.provenanceSummary || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                className="h-7 px-2 text-[10px]"
                                onClick={() => void keepCard(result)}
                              >
                                Keep
                              </Button>
                              {(result.recommendedAction === 'rename_with_context' || result.suggestedTitle) && (
                                <>
                                  {editing ? (
                                    <Button
                                      size="sm"
                                      disabled={busy}
                                      className="h-7 px-2 text-[10px]"
                                      leftIcon={<Pencil className="h-3 w-3" />}
                                      onClick={() => void renameCard(result, renameDraft?.value ?? '')}
                                    >
                                      Save
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={busy}
                                      className="h-7 px-2 text-[10px]"
                                      leftIcon={<Pencil className="h-3 w-3" />}
                                      onClick={() =>
                                        setRenameDraft({
                                          id: result.characterId,
                                          value: result.suggestedTitle ?? result.currentTitle,
                                        })
                                      }
                                    >
                                      Rename
                                    </Button>
                                  )}
                                </>
                              )}
                              {result.recommendedAction === 'merge' &&
                                result.mergeCandidates?.map((candidate) => (
                                  <Button
                                    key={candidate.characterId}
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    className="h-7 px-2 text-[10px]"
                                    leftIcon={<GitMerge className="h-3 w-3" />}
                                    onClick={() => void mergeCard(result, candidate.characterId)}
                                  >
                                    Merge → {candidate.currentTitle}
                                  </Button>
                                ))}
                              {(result.recommendedAction === 'move_to_group' ||
                                result.recommendedAction === 'move_to_interest') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  className="h-7 px-2 text-[10px]"
                                  leftIcon={<Users className="h-3 w-3" />}
                                  onClick={() => void markWrongDomain(result)}
                                >
                                  {result.recommendedAction === 'move_to_group' ? 'Move to group' : 'Move to interest'}
                                </Button>
                              )}
                              {(result.recommendedAction === 'delete' ||
                                result.status === 'junk_test_data' ||
                                result.status === 'bare_title_invalid') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  className="h-7 px-2 text-[10px] text-red-300"
                                  leftIcon={<Trash2 className="h-3 w-3" />}
                                  onClick={() => void deleteCard(result)}
                                >
                                  Delete
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                className="h-7 px-2 text-[10px]"
                                leftIcon={<Lock className="h-3 w-3" />}
                                onClick={() => void lockTitle(result)}
                              >
                                Pin title
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && visibleResults.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-white/45">
                          No characters to audit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex justify-end">
              <Button size="sm" onClick={() => setShowPanel(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
