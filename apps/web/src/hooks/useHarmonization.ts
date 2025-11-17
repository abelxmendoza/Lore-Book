import { useContext } from 'react';

import { HarmonizationContext } from '../harmonization/harmonization.context';

export const useHarmonization = () => {
  const ctx = useContext(HarmonizationContext);
  if (!ctx) {
    throw new Error('HarmonizationProvider is missing');
  }
  return ctx;
};
