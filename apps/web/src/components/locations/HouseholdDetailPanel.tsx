import { Home, Users, DoorOpen, CalendarDays, UserCircle, MapPin } from 'lucide-react';
import type { LocationProfile } from './LocationProfileCard';
import {
  computeHostedEvents,
  computeRoomChildren,
  getPossessiveOwner,
  isHouseholdLocation,
  isVenueLocation,
  roomIcon,
} from '../../lib/locationTaxonomy';

type Props = {
  location: LocationProfile;
  allLocations: LocationProfile[];
  onSelectLocation?: (loc: LocationProfile) => void;
  onOpenMemoriesTab?: () => void;
};

export const HouseholdDetailPanel = ({
  location,
  allLocations,
  onSelectLocation,
  onOpenMemoriesTab,
}: Props) => {
  const isHousehold = isHouseholdLocation(location);
  const isVenue = isVenueLocation(location);
  if (!isHousehold && !isVenue) return null;

  const rooms = isHousehold ? computeRoomChildren(location, allLocations) : [];
  const events = computeHostedEvents(location, allLocations);
  const possessiveOwner = getPossessiveOwner(location);
  const verifiedPeople = location.relatedPeople.filter((p) => p.character_id);

  const residents = [...verifiedPeople];
  if (possessiveOwner && !residents.some((p) => p.name.toLowerCase() === possessiveOwner.toLowerCase())) {
    residents.unshift({
      id: `possessive-${possessiveOwner}`,
      name: possessiveOwner,
      total_mentions: 0,
      entryCount: 0,
      relationship_type: 'lives_at',
    });
  }

  const parentLoc = location.parent_location_id
    ? allLocations.find((l) => l.id === location.parent_location_id)
    : undefined;

  const shellClass = isHousehold
    ? 'rounded-xl border bg-purple-500/5 border-purple-500/20 p-4 space-y-4'
    : 'rounded-xl border bg-violet-500/5 border-violet-500/20 p-4 space-y-4';
  const iconClass = isHousehold ? 'text-purple-300' : 'text-violet-300';
  const title = isHousehold ? 'Household' : 'Venue';

  return (
    <div className={shellClass}>
      <div className="flex items-center gap-2">
        <Home className={`h-4 w-4 ${iconClass}`} />
        <h3 className="text-sm font-semibold text-white">{title} details</h3>
        {location.spatial_subcategory && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/45 uppercase tracking-wider">
            {location.spatial_subcategory.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {parentLoc && onSelectLocation && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>Located in</span>
          <button
            type="button"
            onClick={() => onSelectLocation(parentLoc)}
            className="text-teal-300 hover:text-teal-200 hover:underline underline-offset-2 font-medium"
          >
            {parentLoc.name}
          </button>
        </div>
      )}

      {possessiveOwner && (
        <p className="text-xs text-white/55 leading-relaxed">
          <span className="text-white/35">Associated with </span>
          <span className="text-amber-200/90 font-medium">{possessiveOwner}</span>
          <span className="text-white/35"> — {isHousehold ? 'lives here' : 'linked to this place'}</span>
        </p>
      )}

      {/* Residents */}
      <section>
        <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2 flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          Residents & family ({residents.length})
        </p>
        {residents.length === 0 ? (
          <p className="text-xs text-white/30 italic">No verified residents linked yet — mention who lives here in chat.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {residents.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-2.5 rounded-lg bg-black/30 border border-white/8 px-3 py-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
                  <UserCircle className="h-4 w-4 text-purple-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{person.name}</p>
                  {person.relationship_type && (
                    <p className="text-[10px] text-purple-300/60 capitalize">
                      {person.relationship_type.replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
                {person.entryCount > 0 && (
                  <span className="text-[10px] text-white/35 shrink-0">{person.entryCount} visits</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rooms — households only */}
      {isHousehold && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2 flex items-center gap-1.5">
            <DoorOpen className="h-3 w-3" />
            Rooms ({rooms.length})
          </p>
          {rooms.length === 0 ? (
            <p className="text-xs text-white/30 italic">
              No rooms nested yet — Family Kitchen, Bathroom, etc. appear here after spatial normalization.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectLocation?.(room)}
                  disabled={!onSelectLocation}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-black/35 border border-white/10 text-white/75 hover:border-purple-500/40 hover:text-purple-200 transition-colors disabled:cursor-default"
                >
                  <span aria-hidden>{roomIcon(room.spatial_subcategory)}</span>
                  <span className="font-medium">{room.name}</span>
                  {room.visitCount > 0 && (
                    <span className="text-[10px] text-white/35">{room.visitCount}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Events */}
      <section>
        <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2 flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3" />
          Events hosted here ({events.length})
        </p>
        {events.length === 0 ? (
          <p className="text-xs text-white/30 italic">
            No linked events yet — parties, shows, and anniversaries at this {isHousehold ? 'home' : 'venue'} appear here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-black/25 border border-white/8 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/85 truncate">{event.name}</p>
                  {event.subcategory && (
                    <p className="text-[10px] text-amber-300/55 uppercase">{event.subcategory}</p>
                  )}
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-200/80 shrink-0">
                  Event
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Memories shortcut */}
      {location.visitCount > 0 && onOpenMemoriesTab && (
        <button
          type="button"
          onClick={onOpenMemoriesTab}
          className="w-full text-xs text-center py-2 rounded-lg border border-white/10 bg-white/5 text-white/55 hover:text-teal-200 hover:border-teal-500/30 transition-colors"
        >
          View {location.visitCount} {location.visitCount === 1 ? 'memory' : 'memories'} at {location.name}
        </button>
      )}
    </div>
  );
};
