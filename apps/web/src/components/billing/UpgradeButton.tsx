// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

interface UpgradeButtonProps {
  tier: string;
  onUpgrade?: (tier: string) => void;
}

export const UpgradeButton = ({ tier, onUpgrade }: UpgradeButtonProps) => {
  return (
    <button
      onClick={() => onUpgrade?.(tier)}
      className="w-full rounded-lg border border-primary bg-primary/20 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary/40"
    >
      Upgrade to {tier}
    </button>
  );
};
