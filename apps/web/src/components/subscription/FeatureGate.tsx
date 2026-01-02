import { ReactNode } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { UpgradePrompt } from './UpgradePrompt';

type FeatureGateProps = {
  children: ReactNode;
  feature?: string;
  fallback?: ReactNode;
  requirePremium?: boolean;
};

export const FeatureGate = ({
  children,
  feature,
  fallback,
  requirePremium = false,
}: FeatureGateProps) => {
  const { subscription } = useSubscription();

  const hasAccess = subscription
    ? subscription.isPremium || subscription.isTrial || (!requirePremium && subscription.planType === 'free')
    : false;

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <UpgradePrompt
      message={feature ? `${feature} requires Premium.` : 'This feature requires Premium.'}
      feature={feature}
      variant="modal"
    />
  );
};

