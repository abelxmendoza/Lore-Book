import { describe, expect, it } from 'vitest';
import { render, screen } from '../../../test/utils';
import { RomanticLexicalInsights } from '../RomanticLexicalInsights';

describe('RomanticLexicalInsights', () => {
  it('shows demo lore insights with glossary cues', () => {
    render(<RomanticLexicalInsights demoMode />);
    expect(screen.getByText(/lexical intelligence/i)).toBeInTheDocument();
    expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jordan').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/my girlfriend/i).length).toBeGreaterThan(0);
  });

  it('shows rescan summary in live mode', () => {
    render(
      <RomanticLexicalInsights
        demoMode={false}
        rescanSummary={{
          scannedEpisodes: 100,
          romanticEpisodes: 12,
          partnersDiscovered: 4,
          relationshipsUpserted: 3,
          interactionsLogged: 2,
          glossaryCuesMatched: 8,
          partnerNames: ['Alex'],
          lexicalHits: [
            {
              partnerName: 'Alex',
              relationshipType: 'girlfriend',
              status: 'active',
              confidence: 0.9,
              evidence: 'Alex is my girlfriend',
              cues: ['my girlfriend'],
              ontologyTags: ['CONCEPT/RELATIONSHIP_VERB'],
              isSituationship: false,
            },
          ],
        }}
      />
    );
    expect(screen.getByText(/12 romantic episode/i)).toBeInTheDocument();
    expect(screen.getByText(/Alex is my girlfriend/i)).toBeInTheDocument();
  });

  it('returns null in live mode with no data', () => {
    const { container } = render(<RomanticLexicalInsights demoMode={false} />);
    expect(container.firstChild).toBeNull();
  });
});
