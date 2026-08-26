import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { skillCategoryTheme } from '../../lib/skillCategoryTheme';
import type { Skill } from '../../types/skill';
import { SkillConnectionsTab } from './SkillDetailTabPanels';

function skill(partial: Partial<Skill> & Pick<Skill, 'id' | 'skill_name'>): Skill {
  return {
    user_id: 'mock-user',
    skill_category: 'technical',
    current_level: 3,
    total_xp: 100,
    xp_to_next_level: 50,
    practice_count: 10,
    auto_detected: true,
    confidence_score: 0.8,
    is_active: true,
    first_mentioned_at: '2026-01-01T00:00:00.000Z',
    last_practiced_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    description: '',
    metadata: {},
    ...partial,
  };
}

describe('SkillConnectionsTab', () => {
  it('renders people, places, projects, and related skills from metadata', () => {
    render(
      <SkillConnectionsTab
        skill={skill({
          id: 'skill-demo-cloud',
          skill_name: 'Cloud Architecture',
          metadata: {
            skill_profile: {
              skill_type: 'technical',
              related_projects: ['LoreBook'],
              related_skill_names: ['TypeScript', 'Node.js APIs'],
            },
            skill_details: {
              practiced_at: [
                {
                  location_id: 'hq',
                  location_name: 'Novara HQ',
                  practice_count: 8,
                  last_practiced: '2026-08-01T00:00:00.000Z',
                  evidence_entry_ids: [],
                },
              ],
            },
          },
        })}
        theme={skillCategoryTheme('technical')}
        relatedCharacters={[]}
        relatedOrganizations={[]}
      />,
    );

    expect(screen.getByTestId('skill-connections-tab')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('LoreBook')).toBeInTheDocument();
    expect(screen.getByText('Novara HQ')).toBeInTheDocument();
  });

  it('shows the empty copy when LoreBook has not learned any links yet', () => {
    render(
      <SkillConnectionsTab
        skill={skill({ id: 'empty', skill_name: 'Calligraphy' })}
        theme={skillCategoryTheme('artistic')}
        relatedCharacters={[]}
        relatedOrganizations={[]}
      />,
    );

    expect(
      screen.getByText(
        'Links to people, places, projects, and related skills will appear here as LoreBook learns them.',
      ),
    ).toBeInTheDocument();
  });
});
