export type HarmonizationHighlight = {
  title: string;
  summary?: string;
  reason?: string;
  timestamp?: string;
};

export type HarmonizationCluster = {
  label: string;
  entries: any[];
};

export type HarmonizationState = {
  highlights: HarmonizationHighlight[];
  clusters: HarmonizationCluster[];
  identityHints: any[];
  continuityFlags: any[];
  recommendedSurfaces: string[];
  mode: 'normal' | 'pro';
};

export const initialState: HarmonizationState = {
  highlights: [],
  clusters: [],
  identityHints: [],
  continuityFlags: [],
  recommendedSurfaces: ['timeline', 'notebook'],
  mode: 'normal',
};

type HarmonizationAction =
  | { type: 'SET_SUMMARY'; payload: Partial<HarmonizationState> }
  | { type: 'SET_MODE'; payload: HarmonizationState['mode'] }
  | { type: 'RESET' };

export const harmonizationReducer = (state: HarmonizationState, action: HarmonizationAction): HarmonizationState => {
  switch (action.type) {
    case 'SET_SUMMARY':
      return { ...state, ...action.payload };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};
