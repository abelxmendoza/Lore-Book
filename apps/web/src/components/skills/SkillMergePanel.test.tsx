import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Skill } from '../../types/skill';
import { SkillMergePanel } from './SkillMergePanel';

function skill(id: string, skill_name: string): Skill {
  return {
    id,
    user_id: 'mock-user',
    skill_name,
    skill_category: 'technical',
    current_level: 3,
    total_xp: 100,
    xp_to_next_level: 50,
    practice_count: 4,
    auto_detected: true,
    confidence_score: 0.8,
    is_active: true,
    first_mentioned_at: '2026-01-01T00:00:00.000Z',
    last_practiced_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    description: '',
    metadata: {},
  };
}

describe('SkillMergePanel', () => {
  it('lets the user merge a related skill into the open card or keep the other name', async () => {
    const user = userEvent.setup();
    const onMerge = vi.fn();
    render(
      <SkillMergePanel
        skill={skill('p', 'Prototyping')}
        peers={[skill('hw', 'Hardware Prototyping'), skill('muay', 'Muay Thai')]}
        onMerge={onMerge}
      />,
    );

    await user.click(screen.getByRole('button', { name: /merge into prototyping/i }));
    expect(onMerge).toHaveBeenCalledWith('hw', 'p');

    await user.click(screen.getByRole('button', { name: /keep hardware prototyping/i }));
    expect(onMerge).toHaveBeenCalledWith('p', 'hw');
  });
});
