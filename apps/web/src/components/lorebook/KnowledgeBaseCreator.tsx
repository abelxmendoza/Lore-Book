/**
 * Lorebook Creator Component
 * 
 * Comprehensive UI for creating all types of lorebooks
 * Supports: Full Life, Domain-Specific, Time Range, Thematic
 * With full customization: tone, depth, audience, version
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, BookOpen, Calendar, Tag, Settings, Save, X, Loader2, Info } from 'lucide-react';
import { Label } from '../ui/label';
import { fetchJson } from '../../lib/api';
import type { BiographySpec, Domain, BiographyTone, BiographyDepth, BiographyAudience, BiographyForm } from '../../../server/src/services/biographyGeneration/types';
import {
  LOREBOOK_TIER_ORDER,
  LOREBOOK_TIERS,
  defaultDepthForForm,
  type LorebookForm,
} from '../../lib/lorebookTiers';
import { LoreBookGeneratingScreen, ensureMinGeneratingDuration } from './LoreBookGeneratingScreen';
import './KnowledgeBaseCreator.css';

/** Prefill for launching the creator from another surface (e.g. a timeline arc). */
export interface LorebookCreatorPrefill {
  scope?: 'full_life' | 'domain' | 'time_range' | 'thematic';
  /** Biography domain, used when scope is domain */
  domain?: Domain;
  /** YYYY-MM-DD, used when scope is time_range */
  timeRangeStart?: string;
  timeRangeEnd?: string;
  /** Comma-separated, used when scope is thematic */
  themes?: string;
  lorebookName?: string;
  saveAsCore?: boolean;
  /** Document shape tier */
  form?: LorebookForm;
  /** Forms unlocked on the launching surface (for UI hints) */
  unlockedForms?: LorebookForm[];
  /** Entity focus — forwarded to /api/biography/generate */
  characterIds?: string[];
  locationIds?: string[];
  organizationIds?: string[];
  skillIds?: string[];
}

interface KnowledgeBaseCreatorProps {
  onGenerated: (biography: any) => void;
  onClose?: () => void;
  prefill?: LorebookCreatorPrefill;
}

const DOMAINS: { value: Domain; label: string; description: string }[] = [
  { value: 'fighting', label: 'Fighting', description: 'Martial arts, combat sports, BJJ' },
  { value: 'robotics', label: 'Robotics', description: 'Engineering, coding, tech projects' },
  { value: 'relationships', label: 'Relationships', description: 'All types of relationships' },
  { value: 'creative', label: 'Creative', description: 'Art, writing, music, creative work' },
  { value: 'professional', label: 'Professional', description: 'Career, work, business' },
  { value: 'personal', label: 'Personal', description: 'Personal growth, self-development' },
  { value: 'health', label: 'Health', description: 'Fitness, wellness, medical' },
  { value: 'education', label: 'Education', description: 'Learning, courses, studies' },
  { value: 'family', label: 'Family', description: 'Family relationships and events' },
  { value: 'friendship', label: 'Friendship', description: 'Friends and social connections' },
  { value: 'romance', label: 'Romance', description: 'Dating, romantic relationships' },
];

const TONES: { value: BiographyTone; label: string; description: string }[] = [
  { value: 'neutral', label: 'Neutral', description: 'Factual, balanced narrative' },
  { value: 'dramatic', label: 'Dramatic', description: 'Emphasizes emotional impact' },
  { value: 'reflective', label: 'Reflective', description: 'Introspective, thoughtful' },
  { value: 'mythic', label: 'Mythic', description: 'Larger-than-life storytelling' },
  { value: 'professional', label: 'Professional', description: 'Business/career focused' },
];

const DEPTHS: { value: BiographyDepth; label: string; description: string }[] = [
  { value: 'summary', label: 'Summary', description: 'Brief overview' },
  { value: 'detailed', label: 'Detailed', description: 'Comprehensive narrative' },
  { value: 'epic', label: 'Epic', description: 'Extensive, in-depth storytelling' },
];

const AUDIENCES: { value: BiographyAudience; label: string; description: string }[] = [
  { value: 'self', label: 'Self', description: 'Personal, private' },
  { value: 'public', label: 'Public', description: 'Safe for sharing' },
  { value: 'professional', label: 'Professional', description: 'Career/business context' },
];

const VERSIONS: { value: 'main' | 'safe' | 'explicit' | 'private'; label: string; description: string }[] = [
  { value: 'main', label: 'Main', description: 'Default, full introspection, balanced' },
  { value: 'safe', label: 'Safe/Public', description: 'Filtered for public while living' },
  { value: 'explicit', label: 'Explicit/Death', description: 'Honest, publish after death' },
  { value: 'private', label: 'Private', description: 'Complete, never published' },
];

export const KnowledgeBaseCreator = ({ onGenerated, onClose, prefill }: KnowledgeBaseCreatorProps) => {
  const initialForm: LorebookForm = prefill?.form ?? 'book';
  const [scope, setScope] = useState<'full_life' | 'domain' | 'time_range' | 'thematic'>(prefill?.scope ?? 'full_life');
  const [domain, setDomain] = useState<Domain | undefined>(prefill?.domain);
  const [timeRangeStart, setTimeRangeStart] = useState(prefill?.timeRangeStart ?? '');
  const [timeRangeEnd, setTimeRangeEnd] = useState(prefill?.timeRangeEnd ?? '');
  const [themes, setThemes] = useState(prefill?.themes ?? '');
  const [form, setForm] = useState<LorebookForm>(initialForm);
  const [tone, setTone] = useState<BiographyTone>('neutral');
  const [depth, setDepth] = useState<BiographyDepth>(defaultDepthForForm(initialForm));
  const [audience, setAudience] = useState<BiographyAudience>('self');
  const [version, setVersion] = useState<'main' | 'safe' | 'explicit' | 'private'>('main');
  const [lorebookName, setLorebookName] = useState(prefill?.lorebookName ?? '');
  const [saveAsCore, setSaveAsCore] = useState(prefill?.saveAsCore ?? false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onClose || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generating) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, generating]);

  const selectForm = (next: LorebookForm) => {
    setForm(next);
    setDepth(defaultDepthForForm(next));
  };

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    const startedAt = Date.now();

    try {
      // Build spec based on scope
      const spec: BiographySpec & { version?: string; lorebookName?: string; form?: BiographyForm } = {
        scope,
        tone,
        depth,
        form,
        audience,
        version: version as any, // API expects version field
        includeIntrospection: version !== 'safe',
      };

      // Add scope-specific fields
      if (scope === 'domain') {
        if (!domain) {
          setError('Please select a domain');
          setGenerating(false);
          return;
        }
        spec.domain = domain;
      }

      if (scope === 'time_range') {
        if (!timeRangeStart || !timeRangeEnd) {
          setError('Please provide both start and end dates');
          setGenerating(false);
          return;
        }
        spec.timeRange = {
          start: new Date(timeRangeStart).toISOString(),
          end: new Date(timeRangeEnd).toISOString(),
        };
      }

      if (scope === 'thematic') {
        if (!themes.trim()) {
          setError('Please provide at least one theme');
          setGenerating(false);
          return;
        }
        spec.themes = themes.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }

      // Add lorebook name if saving as core
      if (saveAsCore && lorebookName.trim()) {
        spec.lorebookName = lorebookName.trim();
      }

      const generateBody: Record<string, unknown> = { ...spec };
      if (prefill?.characterIds?.length) generateBody.characterIds = prefill.characterIds;
      if (prefill?.locationIds?.length) generateBody.locationIds = prefill.locationIds;
      if (prefill?.organizationIds?.length) generateBody.organizationIds = prefill.organizationIds;
      if (prefill?.skillIds?.length) generateBody.skillIds = prefill.skillIds;
      if (prefill?.characterIds?.[0]) generateBody.characterId = prefill.characterIds[0];
      if (prefill?.locationIds?.[0]) generateBody.locationId = prefill.locationIds[0];
      if (prefill?.organizationIds?.[0]) generateBody.organizationId = prefill.organizationIds[0];
      if (prefill?.skillIds?.[0]) generateBody.skillId = prefill.skillIds[0];

      const result = await fetchJson<{ biography: any }>('/api/biography/generate', {
        method: 'POST',
        body: JSON.stringify(generateBody),
      });

      if (result.biography) {
        // If saving as core lorebook, save it
        if (saveAsCore && lorebookName.trim()) {
          try {
            await fetchJson(`/api/biography/${result.biography.id}/save-as-core`, {
              method: 'POST',
              body: JSON.stringify({
                lorebookName: lorebookName.trim(),
                version: 1,
              }),
            });
          } catch (saveError) {
            console.warn('Failed to save as core lorebook:', saveError);
            // Continue anyway - biography is still generated
          }
        }

        onGenerated(result.biography);
        if (onClose) {
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate knowledge base');
      console.error('Failed to generate knowledge base:', err);
    } finally {
      await ensureMinGeneratingDuration(startedAt);
      setGenerating(false);
    }
  };

  const getScopeDescription = () => {
    switch (scope) {
      case 'full_life':
        return 'Complete biography from beginning to present';
      case 'domain':
        return 'Focused on a specific area of your life';
      case 'time_range':
        return 'Specific period or era';
      case 'thematic':
        return 'Based on themes or topics';
      default:
        return '';
    }
  };

  const modal = (
    <>
      {generating && (
        <div className="fixed inset-0 z-[120]">
          <LoreBookGeneratingScreen query={lorebookName.trim() || getScopeDescription()} />
        </div>
      )}
      <div
        className="kb-creator-backdrop"
        role="presentation"
        onClick={() => {
          if (!generating && onClose) onClose();
        }}
        data-testid="knowledge-base-creator"
      >
        <div
          className="kb-creator-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kb-creator-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="kb-creator-glow" aria-hidden="true" />
          <div className="kb-creator-accent" aria-hidden="true" />

          <header className="kb-creator-header">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="kb-creator-mark shrink-0" aria-hidden="true">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="kb-creator-eyebrow">LoreBook compiler</p>
                  <h2 id="kb-creator-title" className="kb-creator-title">
                    Create LoreBook
                  </h2>
                  <p className="kb-creator-subtitle">
                    {prefill?.lorebookName
                      ? `Compile “${prefill.lorebookName.replace(/\s*LoreBook$/i, '')}” from your timeline memories.`
                      : 'Weave your memories into a named LoreBook.'}
                  </p>
                </div>
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={generating}
                  className="kb-creator-close"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </header>

          <div className="kb-creator-body">
            {error && <div className="kb-creator-error">{error}</div>}

            <section>
              <div className="kb-creator-section-label">
                <BookOpen className="h-4 w-4 text-amber-300" />
                Form
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {LOREBOOK_TIER_ORDER.map((tier) => {
                  const def = LOREBOOK_TIERS[tier];
                  const hinted =
                    !prefill?.unlockedForms ||
                    prefill.unlockedForms.length === 0 ||
                    prefill.unlockedForms.includes(tier);
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => selectForm(tier)}
                      data-testid={`lorebook-form-${tier}`}
                      className={`kb-creator-chip ${form === tier ? 'is-active' : ''} ${
                        !hinted ? 'opacity-60' : ''
                      }`}
                      title={def.description}
                    >
                      <div className="kb-creator-chip-title">{def.label}</div>
                      <div className="kb-creator-chip-desc">{def.description}</div>
                    </button>
                  );
                })}
              </div>
              <p className="kb-creator-hint">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                Smaller forms unlock earlier as you gather memories. Depth still controls prose density.
              </p>
            </section>

            <section>
              <div className="kb-creator-section-label">
                <BookOpen className="h-4 w-4 text-amber-300" />
                Scope
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {(['full_life', 'domain', 'time_range', 'thematic'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`kb-creator-chip ${scope === s ? 'is-active' : ''}`}
                  >
                    <div className="kb-creator-chip-title capitalize">
                      {s.replace('_', ' ')}
                    </div>
                    <div className="kb-creator-chip-desc">
                      {s === 'full_life' && 'Complete story'}
                      {s === 'domain' && 'By area'}
                      {s === 'time_range' && 'By period'}
                      {s === 'thematic' && 'By theme'}
                    </div>
                  </button>
                ))}
              </div>
              <p className="kb-creator-hint">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                {getScopeDescription()}
              </p>
            </section>

            {scope === 'domain' && (
              <section>
                <Label className="kb-creator-section-label">Domain</Label>
                <select
                  value={domain || ''}
                  onChange={(e) => setDomain(e.target.value as Domain)}
                  className="kb-creator-field"
                >
                  <option value="">Select a domain</option>
                  {DOMAINS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label} — {d.description}
                    </option>
                  ))}
                </select>
              </section>
            )}

            {scope === 'time_range' && (
              <section>
                <div className="kb-creator-section-label">
                  <Calendar className="h-4 w-4 text-amber-300" />
                  Time range
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-amber-100/65 text-xs mb-1.5 block">Start date</Label>
                    <input
                      type="date"
                      value={timeRangeStart}
                      onChange={(e) => setTimeRangeStart(e.target.value)}
                      className="kb-creator-field"
                    />
                  </div>
                  <div>
                    <Label className="text-amber-100/65 text-xs mb-1.5 block">End date</Label>
                    <input
                      type="date"
                      value={timeRangeEnd}
                      onChange={(e) => setTimeRangeEnd(e.target.value)}
                      className="kb-creator-field"
                    />
                  </div>
                </div>
              </section>
            )}

            {scope === 'thematic' && (
              <section>
                <div className="kb-creator-section-label">
                  <Tag className="h-4 w-4 text-amber-300" />
                  Themes
                </div>
                <textarea
                  value={themes}
                  onChange={(e) => setThemes(e.target.value)}
                  placeholder="Enter themes separated by commas (e.g., growth, transformation, challenges)"
                  className="kb-creator-field kb-creator-textarea"
                />
                <p className="kb-creator-hint">Separate multiple themes with commas</p>
              </section>
            )}

            <section className="kb-creator-divider">
              <div className="kb-creator-section-label">
                <Settings className="h-4 w-4 text-amber-300" />
                Style options
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-amber-100/65 text-xs mb-1.5 block">Tone</Label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as BiographyTone)}
                    className="kb-creator-field"
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-amber-100/65 text-xs mb-1.5 block">
                    Depth{form === 'vignette' || form === 'chapter' ? ' (optional)' : ''}
                  </Label>
                  <select
                    value={depth}
                    onChange={(e) => setDepth(e.target.value as BiographyDepth)}
                    className="kb-creator-field"
                  >
                    {DEPTHS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-amber-100/65 text-xs mb-1.5 block">Audience</Label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as BiographyAudience)}
                    className="kb-creator-field"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-amber-100/65 text-xs mb-1.5 block">Version</Label>
                <select
                  value={version}
                  onChange={(e) => setVersion(e.target.value as typeof version)}
                  className="kb-creator-field"
                >
                  {VERSIONS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label} — {v.description}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="kb-creator-divider">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="saveAsCore"
                  checked={saveAsCore}
                  onChange={(e) => setSaveAsCore(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400/40 bg-amber-500/10 text-amber-400 focus:ring-amber-400/40"
                />
                <span className="kb-creator-section-label mb-0">
                  <Save className="h-4 w-4 text-amber-300" />
                  Save as core LoreBook
                </span>
              </label>
              {saveAsCore && (
                <div className="mt-3 ml-7">
                  <input
                    value={lorebookName}
                    onChange={(e) => setLorebookName(e.target.value)}
                    placeholder="Name this LoreBook (e.g. Street Photography)"
                    className="kb-creator-field"
                  />
                  <p className="kb-creator-hint">
                    Core LoreBooks keep a name and can be regenerated later.
                  </p>
                </div>
              )}
            </section>
          </div>

          <footer className="kb-creator-footer">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={
                generating ||
                (scope === 'domain' && !domain) ||
                (scope === 'time_range' && (!timeRangeStart || !timeRangeEnd)) ||
                (scope === 'thematic' && !themes.trim())
              }
              className="kb-creator-generate"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate LoreBook
                </>
              )}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={generating}
                className="kb-creator-cancel"
              >
                Cancel
              </button>
            )}
          </footer>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
};
