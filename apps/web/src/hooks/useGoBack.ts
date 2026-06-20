import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSurfaceFromRoute, type SurfaceKey } from '../utils/routeMapping';

type LocationState = {
  from?: string;
};

const SURFACE_LABELS: Record<SurfaceKey, string> = {
  home: 'Home',
  chat: 'Chat',
  timeline: 'Omni Timeline',
  characters: 'Characters',
  locations: 'Locations',
  memoir: 'LoreBook Editor',
  lorebook: 'Lorebooks',
  photos: 'Photo Album',
  perceptions: 'Perceptions',
  events: 'Life Log',
  entities: 'Entities',
  organizations: 'Groups & Organizations',
  family: 'Family',
  skills: 'Skills',
  projects: 'Projects',
  subscription: 'Subscription',
  pricing: 'Pricing',
  security: 'Privacy & Security',
  'privacy-settings': 'Privacy Settings',
  'privacy-policy': 'Privacy Policy',
  discovery: 'Discovery Hub',
  continuity: 'Continuity',
  guide: 'User Guide',
  love: 'Love & Relationships',
  quests: 'Quests',
  gaps: 'Knowledge Gaps',
  saga: 'Life Saga',
  documents: 'Documents',
  intelligence: 'Intelligence Health',
};

export function backLabelForPath(path?: string): string {
  if (!path || path === '/') return 'Back to Home';
  const pathname = path.split('?')[0] ?? path;
  const surface = getSurfaceFromRoute(pathname);
  const label = SURFACE_LABELS[surface];
  return label ? `Back to ${label}` : 'Back';
}

/** Navigate back using router state, history, or a fallback route. */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  const backLabel = useMemo(() => backLabelForPath(from), [from]);

  const goBack = useCallback(() => {
    if (from && from !== location.pathname) {
      navigate(from);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  }, [navigate, location.pathname, from, fallback]);

  return { goBack, backLabel, from };
}
