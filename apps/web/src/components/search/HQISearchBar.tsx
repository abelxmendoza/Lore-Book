import { Input } from '../ui/input';

export const HQISearchBar = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <Input
    autoFocus
    placeholder="Search memories, characters, arcs…"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full bg-white/10 text-lg"
  />
);
