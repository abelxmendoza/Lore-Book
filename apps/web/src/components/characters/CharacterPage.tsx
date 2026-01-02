import { useCharacterData } from '../../hooks/useCharacterData';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { CharacterClosenessChart } from './CharacterClosenessChart';
import { CharacterHeader } from './CharacterHeader';
import { CharacterInfluenceMeter } from './CharacterInfluenceMeter';
import { CharacterRelationshipGraph } from './CharacterRelationshipGraph';
import { CharacterSharedTimeline } from './CharacterSharedTimeline';

export const CharacterPage = ({ characterId }: { characterId: string }) => {
  const { profile, relationships, memories, closeness, influence } = useCharacterData(characterId);

  if (!profile) return <p className="text-white/60">Loading character…</p>;

  return (
    <div className="space-y-4">
      <CharacterHeader profile={profile} />
      <Card className="border border-border/40 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm text-white/60">Relationships</CardTitle>
        </CardHeader>
        <CardContent>
          <CharacterRelationshipGraph relationships={relationships} center={profile} />
        </CardContent>
      </Card>
      <CharacterSharedTimeline memories={memories} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CharacterClosenessChart closeness={closeness} />
        <CharacterInfluenceMeter influence={influence} />
      </div>
    </div>
  );
};
