import { useGuest } from '../../contexts/GuestContext';
import { useAuth } from '../../lib/supabase';
import { useMockData } from '../../contexts/MockDataContext';
import { GuestExperienceCard } from './GuestExperienceCard';

export const GuestBanner = () => {
  const { isGuest, guestState } = useGuest();
  const { user } = useAuth();
  const { runtimeDataMode } = useMockData();

  if (user || !isGuest || !guestState || runtimeDataMode === 'DEMO') return null;

  return <GuestExperienceCard variant="banner" />;
};
