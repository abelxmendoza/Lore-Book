import { AddCelebrationOverlay } from '../celebrations/AddCelebrationOverlay';

type Props = {
  active: boolean;
  label?: string;
  onDone?: () => void;
};

/** @deprecated Prefer triggerCelebration({ variant: 'romantic', label }) — kept for inline romantic flows. */
export const RomanticAddCelebration = ({ active, label, onDone }: Props) => {
  if (!active || !label) return null;
  return (
    <AddCelebrationOverlay
      variant="romantic"
      label={label}
      onDone={onDone}
    />
  );
};
