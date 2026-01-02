type MoodIndicatorProps = {
  color: string;
  label: string;
  position?: 'top-right' | 'inline';
};

export const MoodIndicator = ({ color, label, position = 'inline' }: MoodIndicatorProps) => {
  if (position === 'top-right') {
    return (
      <div 
        className="absolute right-2 top-2 w-2 h-2 rounded-full opacity-60"
        style={{ backgroundColor: color }}
        title={label}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 text-white/60">
      <div 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: color }}
      />
      <span className="text-xs">{label}</span>
    </div>
  );
};

