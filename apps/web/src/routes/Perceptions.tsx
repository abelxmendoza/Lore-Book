import { PerceptionsView } from '../components/perceptions/PerceptionsView';

export default function Perceptions() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-8">
      <div className="max-w-6xl mx-auto">
        <PerceptionsView showCreateButton={true} />
      </div>
    </div>
  );
}
