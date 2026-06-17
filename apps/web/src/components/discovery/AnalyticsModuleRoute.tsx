import { useLocation } from 'react-router-dom';
import { GenericAnalyticsPanel } from './GenericAnalyticsPanel';

/** Resolves analytics module from the last URL segment (e.g. /discovery/saga → saga). */
export function AnalyticsModuleRoute() {
  const segment = useLocation().pathname.split('/').filter(Boolean).pop() ?? '';
  return <GenericAnalyticsPanel moduleKey={segment} />;
}
