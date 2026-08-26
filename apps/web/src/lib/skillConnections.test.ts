import { describe, expect, it } from 'vitest';
import type { Skill } from '../types/skill';
import {
  assembleSkillConnections,
  inferRelatedProjects,
  pickPeerSkillNames,
  skillConnectionsAreEmpty,
} from './skillConnections';

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

describe('skillConnections', () => {
  it('assembles people, places, projects, and related skills from skill metadata', () => {
    const assembled = assembleSkillConnections({
      skill: skill({
        id: 'skill-demo-ros2',
        skill_name: 'ROS 2',
        metadata: {
          skill_profile: {
            skill_type: 'technical',
            related_projects: ['Omega-1', 'LoreBook'],
            related_jobs: ['Vanguard Robotics'],
            related_skill_names: ['C++', 'Linux'],
          },
          skill_details: {
            learned_from: [
              {
                character_id: 'marcus',
                character_name: 'Marcus',
                relationship_type: 'teacher',
                first_mentioned: '2026-01-01T00:00:00.000Z',
                evidence_entry_ids: [],
              },
            ],
            practiced_with: [
              {
                character_id: 'jamie',
                character_name: 'Jamie',
                practice_count: 4,
                last_practiced: '2026-08-01T00:00:00.000Z',
                evidence_entry_ids: [],
              },
            ],
            practiced_at: [
              {
                location_id: 'lab-1',
                location_name: 'Northwind Depot',
                practice_count: 12,
                last_practiced: '2026-08-01T00:00:00.000Z',
                evidence_entry_ids: [],
              },
            ],
          },
        },
      }),
    });

    expect(assembled.learnedFrom.map((p) => p.name)).toEqual(['Marcus']);
    expect(assembled.practicedWith.map((p) => p.name)).toEqual(['Jamie']);
    expect(assembled.projects).toEqual(['Omega-1', 'LoreBook']);
    expect(assembled.jobs).toEqual(['Vanguard Robotics']);
    expect(assembled.relatedSkills).toEqual(['C++', 'Linux']);
    expect(assembled.places.map((p) => p.name)).toEqual(['Northwind Depot']);
    expect(skillConnectionsAreEmpty(assembled)).toBe(false);
  });

  it('falls back to skill.metadata.skill_details when the details prop is null', () => {
    const assembled = assembleSkillConnections({
      skill: skill({
        id: 'skill-demo-3d',
        skill_name: '3D Modeling',
        metadata: {
          skill_details: {
            practiced_at: [
              {
                location_id: 'studio',
                location_name: 'Home Studio',
                practice_count: 8,
                last_practiced: '2026-08-01T00:00:00.000Z',
                evidence_entry_ids: [],
              },
            ],
          },
        },
      }),
      details: null,
    });

    expect(assembled.places.map((p) => p.name)).toEqual(['Home Studio']);
  });

  it('does not duplicate learned-from people in the extra people list', () => {
    const assembled = assembleSkillConnections({
      skill: skill({
        id: 's1',
        skill_name: 'Pottery',
        metadata: {
          skill_details: {
            learned_from: [
              {
                character_id: 'dummy-1',
                character_name: 'Jamie',
                relationship_type: 'teacher',
                first_mentioned: '2026-01-01T00:00:00.000Z',
                evidence_entry_ids: [],
              },
            ],
          },
        },
      }),
      relatedCharacters: [
        { id: 'dummy-1', name: 'Jamie', relationship: 'Learned from' },
        { id: 'dummy-2', name: 'Taylor', relationship: 'Mentioned together' },
      ],
    });

    expect(assembled.learnedFrom.map((p) => p.name)).toEqual(['Jamie']);
    expect(assembled.otherPeople.map((p) => p.name)).toEqual(['Taylor']);
  });

  it('picks same-category peer skills and infers projects from the skill story', () => {
    const cloud = skill({
      id: 'skill-demo-cloud',
      skill_name: 'Cloud Architecture',
      description: 'Deploy pipelines for LoreBook and Atlas Notes.',
      practice_count: 33,
    });
    const peers = [
      skill({ id: 'skill-demo-ts', skill_name: 'TypeScript', practice_count: 145 }),
      skill({ id: 'skill-demo-node', skill_name: 'Node.js APIs', practice_count: 98 }),
      skill({ id: 'skill-demo-bjj', skill_name: 'Brazilian Jiu-Jitsu', skill_category: 'physical', practice_count: 42 }),
      skill({
        id: 'archived',
        skill_name: 'Old Stack',
        practice_count: 200,
        metadata: { archived: true },
      }),
    ];

    expect(pickPeerSkillNames(cloud, peers)).toEqual(['TypeScript', 'Node.js APIs']);
    expect(inferRelatedProjects(cloud)).toEqual(['LoreBook', 'Atlas Notes']);
  });

  it('treats a skill with no links as empty', () => {
    expect(
      skillConnectionsAreEmpty(
        assembleSkillConnections({
          skill: skill({ id: 'empty', skill_name: 'Calligraphy' }),
        }),
      ),
    ).toBe(true);
  });
});
