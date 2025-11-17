import { useState } from 'react';

export const EmotionalSlider = () => {
  const [value, setValue] = useState(50);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Emotional Charge</span>
        <span className="text-primary font-semibold">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
};
