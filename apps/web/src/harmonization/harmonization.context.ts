import { createContext, type Dispatch } from 'react';

import type { HarmonizationState } from './harmonization.reducer';

export type HarmonizationContextValue = {
  state: HarmonizationState;
  dispatch: Dispatch<any>;
};

export const HarmonizationContext = createContext<HarmonizationContextValue | null>(null);
