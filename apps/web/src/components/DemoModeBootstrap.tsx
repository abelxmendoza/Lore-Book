import { useEffect } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import { mockDataService } from '../services/mockDataService';
import { dummyCharacters } from './characters/CharacterBook';
import { dummyLocations } from './locations/LocationBook';
import { narrativeSkills } from '../mocks/skills';

/**
 * Pre-registers all mock data into the mockDataService registry when demo mode is active.
 * This ensures books have data available on first render without waiting for mount effects
 * in each individual book.
 *
 * Renders nothing — pure side-effect component.
 */
export function DemoModeBootstrap() {
  const { runtimeDataMode } = useMockData();

  useEffect(() => {
    if (runtimeDataMode !== 'DEMO') return;

    mockDataService.register.characters(dummyCharacters);
    mockDataService.register.locations(dummyLocations);
    mockDataService.register.skills(narrativeSkills);
  }, [runtimeDataMode]);

  return null;
}
