import { Input } from '../ui/input';

export const FabricFilterBar = ({
  filters,
  onChange
}: {
  filters: { relation?: string; search?: string };
  onChange: (next: { relation?: string; search?: string }) => void;
}) => (
  <div className="flex gap-2">
    <Input
      placeholder="Search nodes"
      value={filters.search ?? ''}
      onChange={(e) => onChange({ ...filters, search: e.target.value })}
      className="bg-white/5"
    />
    <Input
      placeholder="Relation type"
      value={filters.relation ?? ''}
      onChange={(e) => onChange({ ...filters, relation: e.target.value })}
      className="bg-white/5"
    />
  </div>
);
