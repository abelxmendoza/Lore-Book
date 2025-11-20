import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface GravityScore {
  character: string;
  score: number;
}

interface AttachmentGravityCardProps {
  scores: GravityScore[];
}

const getGravityLabel = (score: number): { label: string; color: string } => {
  if (score >= 76) return { label: 'Extreme', color: 'text-purple-400' };
  if (score >= 51) return { label: 'High', color: 'text-fuchsia-400' };
  if (score >= 26) return { label: 'Medium', color: 'text-blue-400' };
  return { label: 'Low', color: 'text-gray-400' };
};

const getGravityColor = (score: number): string => {
  if (score >= 76) return 'stroke-purple-400';
  if (score >= 51) return 'stroke-fuchsia-400';
  if (score >= 26) return 'stroke-blue-400';
  return 'stroke-gray-400';
};

export const AttachmentGravityCard = ({ scores }: AttachmentGravityCardProps) => {
  if (!scores || scores.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Attachment Gravity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No attachment gravity data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">Attachment Gravity</CardTitle>
        <CardDescription className="text-white/60">
          Emotional attachment strength scores (0-100)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scores.slice(0, 12).map((item) => {
            const { label, color } = getGravityLabel(item.score);
            const strokeColor = getGravityColor(item.score);
            const circumference = 2 * Math.PI * 40; // radius = 40
            const offset = circumference - (item.score / 100) * circumference;

            return (
              <div key={item.character} className="flex flex-col items-center space-y-3">
                <div className="relative w-24 h-24">
                  <svg className="transform -rotate-90 w-24 h-24">
                    {/* Background circle */}
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-white/10"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      className={strokeColor}
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${color}`}>
                        {item.score}
                      </div>
                      <div className="text-xs text-white/60">/100</div>
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-white">{item.character}</div>
                  <div className={`text-sm ${color}`}>{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

