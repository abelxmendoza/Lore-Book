import { Card, CardContent } from '../ui/card';

export const KeyMomentCard = ({ title, summary }: { title: string; summary: string }) => (
  <Card className="border-border/40 bg-black/40">
    <CardContent className="space-y-1 p-3">
      <div className="text-xs uppercase text-white/50">Key Moment</div>
      <div className="text-lg font-semibold text-primary">{title}</div>
      <p className="text-sm text-white/70">{summary}</p>
    </CardContent>
  </Card>
);
