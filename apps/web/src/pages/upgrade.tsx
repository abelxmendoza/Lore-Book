// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { PricingTable } from '../components/billing/PricingTable';

const UpgradePage = () => {
  const handleUpgrade = async (tier: string) => {
    const response = await fetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier })
    });
    const data = await response.json();
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-purple-950 to-black p-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Omega Technologies</p>
          <h1 className="text-3xl font-bold">Choose your Lore Book tier</h1>
          <p className="mt-2 text-white/70">Built for creators who need trustworthy memory, with options for every journey.</p>
        </div>
        <PricingTable onUpgrade={handleUpgrade} />
      </div>
    </div>
  );
};

export default UpgradePage;
