import { PropsWithChildren, useMemo, useReducer } from 'react';

import { HarmonizationContext } from './harmonization.context';
import { harmonizationReducer, initialState } from './harmonization.reducer';

export function HarmonizationProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(harmonizationReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return <HarmonizationContext.Provider value={value}>{children}</HarmonizationContext.Provider>;
}
