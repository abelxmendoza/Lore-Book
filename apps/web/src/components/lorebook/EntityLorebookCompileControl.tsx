/**
 * Compact LoreBook forms control for entity detail modals.
 * Opens the Compile-a-LoreBook tier picker (Vignette → Epic) and launches
 * KnowledgeBaseCreator with entity-scoped prefill.
 *
 * Content buildup is derived from related moments/stories for the subject —
 * not visit/usage proxies — unless the caller passes an explicit tierOffer.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  evaluateTimelineTierOffer,
  type LorebookForm,
  type LorebookTierOffer,
} from '../../lib/lorebookTiers';
import { meterFromTimelineOffer } from '../../lib/lorebookContentMeter';
import {
  fetchEntityLorebookSignals,
  type EntityLorebookCompileFocus,
  type EntityLorebookCompileSignals,
} from '../../lib/entityLorebookSignals';
import { LorebookTierMenu } from './LorebookTierMenu';
import { LorebookContentMeter } from './LorebookContentMeter';
import {
  KnowledgeBaseCreator,
  type LorebookCreatorPrefill,
} from './KnowledgeBaseCreator';

export type { EntityLorebookCompileFocus, EntityLorebookCompileSignals };

type Props = {
  subjectLabel: string;
  /** Precomputed offer; if omitted, derived from fetched/local signals. */
  tierOffer?: LorebookTierOffer;
  /**
   * Optional seed while related content loads, or for single-moment surfaces
   * (event/memory detail) that already have the text in hand.
   * Ignored once a fetch for entity focus completes.
   */
  signals?: EntityLorebookCompileSignals;
  focus?: EntityLorebookCompileFocus;
  /**
   * Allow compiling a locked form (timeline/demo edge cases).
   * Does NOT paint locked cards as Unlocked.
   */
  forceEnable?: boolean;
  buttonLabel?: string;
  testId?: string;
  className?: string;
  /** Show segmented content meter next to the LoreBook control (default true). */
  showMeter?: boolean;
  /**
   * When true (default), fetch related moments for character/location/org/skill
   * focus so the meter reflects real subject coverage.
   */
  autoFetchSignals?: boolean;
};

function buildPrefill(
  subjectLabel: string,
  form: LorebookForm,
  offer: LorebookTierOffer,
  focus?: EntityLorebookCompileFocus,
): LorebookCreatorPrefill {
  const themes =
    focus?.themes?.trim() ||
    subjectLabel.trim() ||
    'life story';
  return {
    scope: 'thematic',
    themes,
    lorebookName: `${subjectLabel} LoreBook`,
    saveAsCore: true,
    form,
    unlockedForms: offer.unlocked,
    characterIds: focus?.characterId ? [focus.characterId] : undefined,
    locationIds: focus?.locationId ? [focus.locationId] : undefined,
    organizationIds: focus?.organizationId ? [focus.organizationId] : undefined,
    skillIds: focus?.skillId ? [focus.skillId] : undefined,
  };
}

function shouldAutoFetch(focus?: EntityLorebookCompileFocus): boolean {
  return Boolean(
    focus?.characterId ||
      focus?.locationId ||
      focus?.organizationId ||
      focus?.skillId,
  );
}

/**
 * Amber chip: LoreBook tier menu + content buildup meter + creator overlay.
 */
export function EntityLorebookCompileControl({
  subjectLabel,
  tierOffer: tierOfferProp,
  signals: signalsProp,
  focus,
  forceEnable = false,
  buttonLabel = 'LoreBook',
  testId = 'entity-lorebook-compile',
  className = '',
  showMeter = true,
  autoFetchSignals = true,
}: Props) {
  const [prefill, setPrefill] = useState<LorebookCreatorPrefill | null>(null);
  const [fetchedSignals, setFetchedSignals] = useState<EntityLorebookCompileSignals | null>(null);

  const focusCharacterId = focus?.characterId;
  const focusLocationId = focus?.locationId;
  const focusOrganizationId = focus?.organizationId;
  const focusSkillId = focus?.skillId;
  const focusThemes = focus?.themes;
  const fetchKey = [
    focusCharacterId ?? '',
    focusLocationId ?? '',
    focusOrganizationId ?? '',
    focusSkillId ?? '',
    focusThemes ?? '',
    subjectLabel.trim(),
  ].join('|');

  useEffect(() => {
    const nextFocus: EntityLorebookCompileFocus = {
      characterId: focusCharacterId,
      locationId: focusLocationId,
      organizationId: focusOrganizationId,
      skillId: focusSkillId,
      themes: focusThemes,
    };

    if (tierOfferProp || !autoFetchSignals || !shouldAutoFetch(nextFocus)) {
      setFetchedSignals(null);
      return;
    }

    let cancelled = false;
    setFetchedSignals(null);

    void fetchEntityLorebookSignals({ subjectLabel, focus: nextFocus }).then((next) => {
      if (!cancelled) setFetchedSignals(next);
    });

    return () => {
      cancelled = true;
    };
  }, [
    tierOfferProp,
    autoFetchSignals,
    fetchKey,
    subjectLabel,
    focusCharacterId,
    focusLocationId,
    focusOrganizationId,
    focusSkillId,
    focusThemes,
  ]);

  const signals = fetchedSignals ?? signalsProp;

  const tierOffer = useMemo(() => {
    if (tierOfferProp) return tierOfferProp;
    return evaluateTimelineTierOffer({
      eventCount: signals?.eventCount ?? 0,
      uniqueDays: signals?.uniqueDays ?? 0,
      wordCount: signals?.wordCount ?? 0,
      domainReady: signals?.domainReady,
      subjectLabel,
    });
  }, [tierOfferProp, signals, subjectLabel]);

  const meter = useMemo(() => {
    if (tierOfferProp) {
      return {
        progress: tierOfferProp.meter.progress,
        counterLabel: tierOfferProp.meter.counterLabel,
        detailLabel: tierOfferProp.meter.detailLabel,
        ready: tierOfferProp.meter.ready,
        currentForm: tierOfferProp.meter.currentForm,
        nextForm: tierOfferProp.meter.nextForm,
        segmentProgress: tierOfferProp.meter.segmentProgress,
        tierOffer: tierOfferProp,
      };
    }
    return meterFromTimelineOffer({
      eventCount: signals?.eventCount ?? 0,
      uniqueDays: signals?.uniqueDays ?? 0,
      wordCount: signals?.wordCount ?? 0,
      domainReady: signals?.domainReady,
      subjectLabel,
      canCreate: tierOffer.canCreateAny,
      reason: tierOffer.meter.detailLabel,
    });
  }, [tierOfferProp, signals, subjectLabel, tierOffer]);

  const offerForMeter = meter.tierOffer ?? tierOffer;

  const handleSelectForm = (form: LorebookForm) => {
    setPrefill(buildPrefill(subjectLabel, form, offerForMeter, focus));
  };

  return (
    <>
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 pl-2 pr-2 py-1 ${className}`}
        data-testid={testId}
      >
        <LorebookTierMenu
          tierOffer={offerForMeter}
          forceEnable={forceEnable}
          onSelectForm={handleSelectForm}
          subjectLabel={subjectLabel}
          buttonLabel={buttonLabel}
          testId={`${testId}-menu`}
        />
        {showMeter && <LorebookContentMeter meter={meter} />}
      </div>

      {prefill && (
        <KnowledgeBaseCreator
          prefill={prefill}
          onClose={() => setPrefill(null)}
          onGenerated={() => setPrefill(null)}
        />
      )}
    </>
  );
}
