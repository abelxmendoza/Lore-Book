import { useDispatch, useSelector, useStore } from 'react-redux';

import type { RootState, AppDispatch, store } from './index';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<typeof store>();
