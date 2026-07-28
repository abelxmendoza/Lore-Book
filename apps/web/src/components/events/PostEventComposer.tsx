/**
 * Shared composer for posting a Life Log Event.
 * Easy path: write a story (and optional when / photos) → Post event → main chat.
 * Extra fields live under "More details".
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ImagePlus, Loader2, MapPin, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { mockDataService } from '../../services/mockDataService';
import { createDemoUserPostedEvent } from '../../mocks/userPostedEventsDemo';
import { locationAliasesForDisplay } from '../../lib/locationMergeMetadata';
import {
  compressChatImages,
  MAX_CHAT_IMAGES_PER_TURN,
  type ChatImageAttachment,
} from '../../features/chat/types/chatImageAttachment';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import {
  buildPostedEventIngestPrompt,
  stashPostEventChatHandoff,
} from '../../lib/postEventChatHandoff';
import { parseApproximateWhen, titleFromStory } from '../../lib/parseApproximateWhen';

export type PostEventComposerPrefill = {
  location_id?: string;
  location_name?: string;
  organization_id?: string;
  organization_name?: string;
  title?: string;
  start_time?: string;
  story?: string;
};

export type PostedEventResult = {
  id: string;
  title: string;
  start_time: string | null;
  metadata?: Record<string, unknown>;
};

type PlaceOption = { id: string; name: string; aliases?: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (event: PostedEventResult) => void;
  prefill?: PostEventComposerPrefill;
};

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function PostEventComposer({ open, onClose, onCreated, prefill }: Props) {
  const isMock = useShouldUseMockData();
  const [title, setTitle] = useState('');
  const [whenText, setWhenText] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [flyerUrl, setFlyerUrl] = useState('');
  const [media, setMedia] = useState<ChatImageAttachment[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaCompressing, setMediaCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyRef = useRef<HTMLTextAreaElement>(null);
  const [story, setStory] = useState('');
  const [placeSearch, setPlaceSearch] = useState(prefill?.location_name ?? '');
  const [selectedPlaceId, setSelectedPlaceId] = useState(prefill?.location_id ?? '');
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[]>([]);
  const [afterpartySearch, setAfterpartySearch] = useState('');
  const [afterpartyId, setAfterpartyId] = useState('');
  const [afterpartyName, setAfterpartyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title?.trim() ?? '');
    setWhenText(
      prefill?.start_time
        ? new Date(prefill.start_time).toISOString().slice(0, 10)
        : '',
    );
    setShowDetails(Boolean(prefill?.title || prefill?.location_name));
    setFlyerUrl('');
    setMedia([]);
    setMediaError(null);
    setStory(prefill?.story?.trim() ?? '');
    setPlaceSearch(prefill?.location_name ?? '');
    setSelectedPlaceId(prefill?.location_id ?? '');
    setAfterpartySearch('');
    setAfterpartyId('');
    setAfterpartyName('');
    setError(null);
    const focusTimer = window.setTimeout(() => storyRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [
    open,
    prefill?.location_id,
    prefill?.location_name,
    prefill?.title,
    prefill?.start_time,
    prefill?.story,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setPlacesLoading(true);
      try {
        if (isMock) {
          const locs = mockDataService.get.locations().map((l) => ({
            id: l.id,
            name: l.name,
            aliases: locationAliasesForDisplay(l.metadata),
          }));
          if (!cancelled) setPlaceOptions(locs);
          return;
        }
        const index = await fetchJson<{
          entities?: Array<{ id: string; name: string; aliases?: string[] }>;
        }>('/api/entities/book-index?types=location&limit=100');
        if (!cancelled) {
          setPlaceOptions(
            (index.entities ?? []).map((e) => ({
              id: e.id,
              name: e.name,
              aliases: e.aliases,
            })),
          );
        }
      } catch {
        if (!cancelled) setPlaceOptions([]);
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, isMock]);

  const filteredPlaces = useMemo(() => {
    const term = placeSearch.trim().toLowerCase();
    if (!term) return placeOptions.slice(0, 12);
    return placeOptions
      .filter((p) => {
        const hay = [p.name, ...(p.aliases ?? [])].join(' ').toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 12);
  }, [placeOptions, placeSearch]);

  const filteredAfterparty = useMemo(() => {
    const term = afterpartySearch.trim().toLowerCase();
    if (!term) return placeOptions.slice(0, 8);
    return placeOptions
      .filter((p) => {
        if (p.id === selectedPlaceId) return false;
        const hay = [p.name, ...(p.aliases ?? [])].join(' ').toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [placeOptions, afterpartySearch, selectedPlaceId]);

  const whenPreview = useMemo(() => parseApproximateWhen(whenText), [whenText]);

  const addMediaFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMediaError(null);
    setMediaCompressing(true);
    try {
      const { images, error: compressError } = await compressChatImages(files, media.length);
      if (compressError) setMediaError(compressError);
      if (images.length > 0) {
        setMedia((prev) => [...prev, ...images].slice(0, MAX_CHAT_IMAGES_PER_TURN));
      }
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Could not add photos');
    } finally {
      setMediaCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!open) return null;

  const handoffToMainChat = (
    created: PostedEventResult,
    images: ChatImageAttachment[],
    resolvedWhen: string,
    resolvedTitle: string,
  ) => {
    const selectedPlace = placeOptions.find((p) => p.id === selectedPlaceId);
    const locationName = selectedPlace?.name || placeSearch.trim() || prefill?.location_name || null;
    const prompt = buildPostedEventIngestPrompt({
      eventId: created.id,
      title: resolvedTitle,
      date: resolvedWhen || whenText.trim() || 'unknown / not specified',
      placeName: locationName,
      organizationName: prefill?.organization_name ?? null,
      story: story.trim() || null,
      photoCount: images.length,
      storyOnly: !title.trim() && !placeSearch.trim() && !whenText.trim(),
    });

    stashPostEventChatHandoff({
      eventId: created.id,
      eventTitle: created.title,
      images,
      autoSubmit: true,
    });

    openChatWithFocus({
      entityId: created.id,
      entityName: created.title,
      entityType: 'event',
      sourceSurface: 'events',
      sourceLabel: 'Life Log',
      knowledgeScope: 'process this posted event into timelines and knowledge bases',
      initialPrompt: prompt,
      autoSubmit: true,
      startNewThread: true,
    });
  };

  const submit = async () => {
    const storyText = story.trim();
    const titleText = title.trim();
    if (!storyText && !titleText && media.length === 0 && !flyerUrl.trim()) {
      setError('Write what happened — or add a title / photo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const selectedPlace = placeOptions.find((p) => p.id === selectedPlaceId);
      const locationName = selectedPlace?.name || placeSearch.trim() || prefill?.location_name || null;
      const locationIdRaw = selectedPlaceId || prefill?.location_id || null;
      const locationId = isMock || isUuid(locationIdRaw) ? locationIdRaw : null;
      const orgIdRaw = prefill?.organization_id ?? null;
      const organizationId = isMock || isUuid(orgIdRaw) ? orgIdRaw : null;
      const venueStops =
        afterpartyName.trim() || afterpartyId
          ? [
              {
                location_id: afterpartyId || null,
                location_name:
                  afterpartyName.trim() ||
                  placeOptions.find((p) => p.id === afterpartyId)?.name ||
                  afterpartySearch.trim(),
                role: 'afterparty' as const,
              },
            ]
          : [];

      const mediaSnapshot = [...media];
      const pastedFlyer = flyerUrl.trim() || null;
      const demoPhotoUrls = [
        ...mediaSnapshot.map((m) => m.dataUrl).filter(Boolean),
        ...(pastedFlyer ? [pastedFlyer] : []),
      ].slice(0, MAX_CHAT_IMAGES_PER_TURN);

      const when = parseApproximateWhen(whenText);
      const resolvedTitle = titleText || (storyText ? titleFromStory(storyText) : 'Posted moment');

      const payload = {
        title: titleText || null,
        start_time: when.startTime,
        when_text: when.whenText,
        flyer_url: pastedFlyer,
        photo_urls: pastedFlyer ? [pastedFlyer] : null,
        photos: mediaSnapshot.map((m) => ({
          dataUrl: m.dataUrl,
          fileName: m.fileName ?? null,
        })),
        location_id: locationId,
        location_name: locationName,
        organization_id: organizationId,
        organization_name: prefill?.organization_name ?? null,
        story: storyText || null,
        venue_stops: venueStops.filter((s) => s.location_name),
      };

      let created: PostedEventResult;
      if (isMock) {
        created = createDemoUserPostedEvent({
          ...payload,
          title: resolvedTitle,
          photo_urls: demoPhotoUrls,
          flyer_url: demoPhotoUrls[0] || pastedFlyer,
        });
      } else {
        const res = await fetchJson<{ success: boolean; event: PostedEventResult }>(
          '/api/conversation/events',
          { method: 'POST', body: JSON.stringify(payload) },
        );
        if (!res.event?.id) throw new Error('Event was not created');
        created = res.event;
      }

      onCreated(created);
      onClose();
      handoffToMainChat(
        created,
        mediaSnapshot,
        when.whenText || when.startTime || '',
        created.title || resolvedTitle,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post this event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Post an event"
      data-testid="post-event-composer"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/12 bg-zinc-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/70">Life Log</p>
            <h2 className="text-base font-semibold text-white">Post an event</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-white/10 text-white/50 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4 mx-auto" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              What happened? (story)
            </span>
            <Textarea
              ref={storyRef}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              rows={5}
              placeholder="Just dump the story — who was there, where you went, how it felt. Title and details can wait."
              className="bg-black/55 border-white/12 text-white min-h-[120px]"
              data-testid="post-event-story"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> When? (optional)
            </span>
            <Input
              value={whenText}
              onChange={(e) => setWhenText(e.target.value)}
              placeholder="summer 2019 · around June · last weekend · leave blank"
              className="h-10 bg-black/55 border-white/12 text-white"
              data-testid="post-event-when"
            />
            {whenText.trim() && (
              <p className="text-[11px] text-white/40" data-testid="post-event-when-preview">
                {whenPreview.temporalStatus === 'unanchored'
                  ? 'We’ll keep that phrase and let Lore place it from your story.'
                  : whenPreview.temporalPrecision === 'date' && whenPreview.temporalStatus === 'anchored'
                    ? 'Exact date noted.'
                    : `Approximate · ${whenPreview.temporalPrecision}`}
              </p>
            )}
          </label>

          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40 flex items-center gap-1">
              <ImagePlus className="h-3 w-3" /> Flyer & photos (optional)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              data-testid="post-event-media-input"
              onChange={(e) => void addMediaFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={mediaCompressing || media.length >= MAX_CHAT_IMAGES_PER_TURN}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/40 px-3 py-3 text-sm text-white/70 hover:border-amber-400/40 hover:text-amber-100 disabled:opacity-50"
              data-testid="post-event-media-upload"
            >
              {mediaCompressing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {media.length === 0
                ? 'Upload flyer or photos'
                : `Add more (${media.length}/${MAX_CHAT_IMAGES_PER_TURN})`}
            </button>
            {media.length > 0 && (
              <div className="grid grid-cols-3 gap-2" data-testid="post-event-media-preview">
                {media.map((img) => (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-lg border border-white/10">
                    <img src={img.dataUrl} alt={img.fileName || 'Event photo'} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 rounded-md bg-black/70 p-0.5 text-white/80 hover:text-white"
                      onClick={() => setMedia((prev) => prev.filter((m) => m.id !== img.id))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {mediaError && <p className="text-[11px] text-amber-200/80">{mediaError}</p>}
          </div>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-white/70 hover:bg-white/[0.06]"
            data-testid="post-event-more-details"
            aria-expanded={showDetails}
          >
            <span>More details (title, place, afterparty…)</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>

          {showDetails && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Title</span>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional — we’ll name it from your story"
                  className="h-10 bg-black/55 border-white/12 text-white"
                  data-testid="post-event-title"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Primary place
                </span>
                <SearchWithAutocomplete
                  value={placeSearch}
                  onChange={(next) => {
                    setPlaceSearch(next);
                    if (selectedPlaceId) {
                      const selected = placeOptions.find((p) => p.id === selectedPlaceId);
                      if (!selected || selected.name.toLowerCase() !== next.trim().toLowerCase()) {
                        setSelectedPlaceId('');
                      }
                    }
                  }}
                  onSelectItem={(item) => {
                    setSelectedPlaceId(item.id);
                    setPlaceSearch(item.name);
                  }}
                  placeholder={placesLoading ? 'Loading places…' : 'Search Places Book…'}
                  items={filteredPlaces}
                  getSearchableText={(loc) => [loc.name, ...(loc.aliases ?? [])].join(' ')}
                  getDisplayLabel={(loc) => loc.name}
                  getItemKey={(loc) => loc.id}
                  minCharsToSuggest={0}
                  maxSuggestions={12}
                  emptyHint={placeOptions.length === 0 ? 'No places yet' : 'No matching places'}
                  disabled={placesLoading}
                  data-testid="post-event-place-search"
                  inputClassName="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                />
                {prefill?.organization_name && (
                  <p className="text-[11px] text-white/40">
                    Host group: <span className="text-white/70">{prefill.organization_name}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Then we went to… (optional)
                </span>
                <SearchWithAutocomplete
                  value={afterpartySearch}
                  onChange={(next) => {
                    setAfterpartySearch(next);
                    setAfterpartyName(next);
                    if (afterpartyId) {
                      const selected = placeOptions.find((p) => p.id === afterpartyId);
                      if (!selected || selected.name.toLowerCase() !== next.trim().toLowerCase()) {
                        setAfterpartyId('');
                      }
                    }
                  }}
                  onSelectItem={(item) => {
                    setAfterpartyId(item.id);
                    setAfterpartyName(item.name);
                    setAfterpartySearch(item.name);
                  }}
                  placeholder="Afterparty / next venue…"
                  items={filteredAfterparty}
                  getSearchableText={(loc) => [loc.name, ...(loc.aliases ?? [])].join(' ')}
                  getDisplayLabel={(loc) => loc.name}
                  getItemKey={(loc) => loc.id}
                  minCharsToSuggest={0}
                  maxSuggestions={8}
                  emptyHint="Type a place name"
                  data-testid="post-event-afterparty-search"
                  inputClassName="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                />
              </div>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                  Flyer URL (optional)
                </span>
                <Input
                  value={flyerUrl}
                  onChange={(e) => setFlyerUrl(e.target.value)}
                  placeholder="https://…"
                  className="h-9 bg-black/55 border-white/12 text-white text-xs"
                  data-testid="post-event-flyer"
                />
              </label>
            </div>
          )}

          <p className="text-[11px] text-white/35">
            Post event opens main chat so Lore can place it on your timeline and update your knowledge base.
          </p>

          {error && (
            <p className="text-xs text-red-300" data-testid="post-event-error">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-white/10 bg-zinc-950/95 px-4 py-3">
          <Button type="button" variant="outline" className="flex-1 border-white/12" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 bg-amber-500/25 border border-amber-400/40 text-amber-50 hover:bg-amber-500/35"
            onClick={() => void submit()}
            disabled={saving || mediaCompressing}
            data-testid="post-event-submit"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post event'}
          </Button>
        </div>
      </div>
    </div>
  );
}
