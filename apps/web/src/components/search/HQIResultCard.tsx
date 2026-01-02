import type { HQIResult } from '../../api/hqi';
import { Card, CardContent } from '../ui/card';

export const HQIResultCard = ({ result }: { result: HQIResult }) => (
  <Card className="border-border/40 bg-white/5">
    <CardContent className="space-y-1 p-3">
      <div className="flex items-center justify-between text-xs uppercase text-white/50">
        <span>{result.type}</span>
        {typeof result.score === 'number' && <span className="text-primary">{(result.score * 100).toFixed(0)} HQI</span>}
      </div>
      <div className="text-lg font-semibold text-foreground">{result.title}</div>
      {result.snippet && <p className="text-white/60">{result.snippet}</p>}
      {result.tags && result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[10px] text-white/50">
          {result.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-primary/50 px-2 py-0.5">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);
