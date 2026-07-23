import { describe, expect, it } from 'vitest';

import type { Skill } from '../types/skill';

import { buildDatingRomanceClipboardText } from './datingRomanceClipboard';
import { buildListClipboardText, formatClipboardFields } from './listClipboard';
import { buildLocationBookClipboardText } from './locationBookClipboard';
import { buildLocationDuplicatesClipboardText } from './locationDuplicatesClipboard';
import { buildLocationSuggestionsClipboardText } from './locationSuggestionsClipboard';
import { buildOrganizationBookClipboardText } from './organizationBookClipboard';
import { buildPhotoAlbumClipboardText } from './photoAlbumClipboard';
import { buildProjectBookClipboardText } from './projectBookClipboard';
import { buildProjectSuggestionsClipboardText } from './projectSuggestionsClipboard';
import { buildQuestSuggestionsClipboardText } from './questSuggestionsClipboard';
import { buildSkillBookClipboardText } from './skillBookClipboard';

describe('listClipboard', () => {
  it('formats fields and skips empties', () => {
    expect(
      formatClipboardFields([
        { label: 'Name', value: 'Jamie' },
        { label: 'Tags', value: ['friend', 'cast'] },
        { label: 'Empty', value: '' },
        { label: 'None', value: null },
      ]),
    ).toBe('Name: Jamie\nTags: friend, cast');
  });

  it('builds a numbered list with metadata', () => {
    const text = buildListClipboardText({
      title: 'Demo List',
      items: [
        {
          heading: 'First',
          fields: [{ label: 'Role', value: 'friend' }],
          body: 'Met at school',
        },
      ],
    });
    expect(text).toContain('Demo List (1 item)');
    expect(text).toContain('1. First');
    expect(text).toContain('Role: friend');
    expect(text).toContain('Met at school');
  });
});

describe('buildPhotoAlbumClipboardText', () => {
  it('includes photo metadata for lore export', () => {
    const text = buildPhotoAlbumClipboardText([
      {
        id: 'p1',
        date: '2026-07-01T12:00:00.000Z',
        content: 'Night out after the show',
        summary: 'After the show',
        tags: ['photo', 'chat', 'lore_linked'],
        metadata: {
          photoUrl: 'https://cdn.example/p1.jpg',
          photoId: 'photo-1',
          locationName: 'Northwind Depot',
          people: ['Marcus'],
          sessionId: 'sess-1',
          chatMessageId: 'msg-1',
          platforms: ['instagram'],
          mediaKinds: ['social_story'],
        },
      },
    ]);
    expect(text).toContain('Photo Album (1 item)');
    expect(text).toContain('After the show');
    expect(text).toContain('Location: Northwind Depot');
    expect(text).toContain('People: Marcus');
    expect(text).toContain('Platforms: instagram');
    expect(text).toContain('Session: sess-1');
    expect(text).toContain('Night out after the show');
  });
});

describe('buildLocationBookClipboardText', () => {
  it('includes place metadata', () => {
    const text = buildLocationBookClipboardText([
      {
        id: 'loc-1',
        name: 'Northwind Depot',
        type: 'workplace',
        city: 'Hollywood',
        region: 'CA',
        country: 'US',
        visitCount: 4,
        relatedPeople: [{ id: 'c1', name: 'Marcus', total_mentions: 2, entryCount: 2 }],
        tagCounts: [{ tag: 'work', count: 3 }],
        chapters: [],
        moods: [],
        entries: [],
        sources: ['chat'],
        description: 'Main work site',
      },
    ]);
    expect(text).toContain('Places / Locations (1 item)');
    expect(text).toContain('Northwind Depot');
    expect(text).toContain('People: Marcus');
    expect(text).toContain('Visits: 4');
    expect(text).toContain('Main work site');
  });
});

describe('buildOrganizationBookClipboardText', () => {
  it('includes group metadata', () => {
    const text = buildOrganizationBookClipboardText([
      {
        id: 'org-1',
        name: 'Vanguard Robotics',
        aliases: ['VR'],
        type: 'company',
        group_type: 'company',
        membership_model: 'strict',
        user_relationship: 'member',
        is_public_entity: false,
        status: 'active',
        member_count: 2,
        usage_count: 5,
        confidence: 0.9,
        last_seen: '2026-07-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
        members: [
          {
            id: 'm1',
            character_name: 'Gary',
            role: 'coworker',
            status: 'active',
          },
        ],
        locations: [{ id: 'l1', location_name: 'Northwind Depot', visit_count: 2 }],
        description: 'Workplace crew',
      },
    ]);
    expect(text).toContain('Groups and Organizations (1 item)');
    expect(text).toContain('Vanguard Robotics');
    expect(text).toContain('Members: Gary (coworker)');
    expect(text).toContain('Places: Northwind Depot');
    expect(text).toContain('Workplace crew');
  });
});

describe('buildSkillBookClipboardText', () => {
  it('includes skill progress, relationships, and narrative metadata', () => {
    const skill: Skill = {
      id: 'skill-1',
      user_id: 'user-1',
      skill_name: 'Robotics',
      skill_category: 'technical',
      current_level: 7,
      total_xp: 840,
      xp_to_next_level: 160,
      description: 'Building autonomous machines.',
      first_mentioned_at: '2026-01-01T00:00:00.000Z',
      last_practiced_at: '2026-07-01T00:00:00.000Z',
      practice_count: 12,
      auto_detected: true,
      confidence_score: 0.92,
      is_active: true,
      metadata: {
        skill_profile: {
          skill_type: 'technical',
          monetization: 'potentially_paid',
          proficiency: 72,
          enjoyment: 90,
          usage_frequency: 'weekly',
          trajectory: 'improving',
          related_projects: ['Vanguard Rover'],
          story_summary: 'A practical engineering craft.',
        },
        skill_details: {
          learned_from: [
            {
              character_id: 'c1',
              character_name: 'Marcus',
              relationship_type: 'mentor',
              first_mentioned: '2026-01-01',
              evidence_entry_ids: ['e1'],
            },
          ],
          practiced_at: [
            {
              location_id: 'l1',
              location_name: 'Vanguard Robotics Lab',
              practice_count: 4,
              last_practiced: '2026-07-01',
              evidence_entry_ids: ['e2'],
            },
          ],
        },
      },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };

    const text = buildSkillBookClipboardText([skill]);
    expect(text).toContain('Skills Book (1 item)');
    expect(text).toContain('Level: 7');
    expect(text).toContain('Related projects: Vanguard Rover');
    expect(text).toContain('Learned from: Marcus');
    expect(text).toContain('Places: Vanguard Robotics Lab');
    expect(text).toContain('A practical engineering craft.');
  });
});

describe('buildProjectBookClipboardText', () => {
  it('includes project status, dates, tags, and description', () => {
    const text = buildProjectBookClipboardText([
      {
        id: 'project-1',
        name: 'MemoVault',
        type: 'software',
        status: 'active',
        description: 'A synthetic personal knowledge project.',
        tags: ['memory', 'typescript'],
        started_at: '2026-01-01T00:00:00.000Z',
        ended_at: null,
        importance_score: 88,
        updated_at: '2026-07-01T00:00:00.000Z',
        metadata: { source: 'chat' },
      },
    ]);
    expect(text).toContain('Projects Book (1 item)');
    expect(text).toContain('Status: active');
    expect(text).toContain('Tags: memory, typescript');
    expect(text).toContain('Importance: 88');
    expect(text).toContain('A synthetic personal knowledge project.');
  });
});

describe('buildQuestSuggestionsClipboardText', () => {
  it('includes quest type, priority, confidence, and reasoning', () => {
    const text = buildQuestSuggestionsClipboardText([
      {
        id: 'sugg-1',
        title: 'Finish the robotics prototype',
        description: 'Wrap up the Vanguard Rover build before the showcase.',
        quest_type: 'main',
        priority: 8,
        importance: 9,
        impact: 7,
        confidence: 0.86,
        match_status: 'new',
        reasoning: 'Mentioned deadline pressure across three recent chats.',
      },
    ]);

    expect(text).toContain('Suggested Quests (1 item)');
    expect(text).toContain('1. Finish the robotics prototype');
    expect(text).toContain('Type: main');
    expect(text).toContain('Priority: 8');
    expect(text).toContain('Confidence: 86%');
    expect(text).toContain('Match status: new');
    expect(text).toContain('Mentioned deadline pressure across three recent chats.');
  });

  it('renders an empty-list placeholder when there are no suggestions', () => {
    const text = buildQuestSuggestionsClipboardText([]);
    expect(text).toContain('Suggested Quests (0 items)');
    expect(text).toContain('(empty)');
  });
});

describe('buildProjectSuggestionsClipboardText', () => {
  it('includes project type, confidence, match status, and evidence', () => {
    const text = buildProjectSuggestionsClipboardText([
      {
        id: 'proj-sugg-1',
        name: 'MemoVault',
        description: 'Personal knowledge archive for life lore.',
        project_type: 'software',
        status: 'active',
        confidence: 0.91,
        match_status: 'new',
        reasoning: 'Repeated build talk across recent chats.',
        evidence: [{ text: 'I am building MemoVault this quarter.' }],
        source: 'chat',
      },
    ]);

    expect(text).toContain('Suggested Projects (1 item)');
    expect(text).toContain('1. MemoVault');
    expect(text).toContain('Type: software');
    expect(text).toContain('Confidence: 91%');
    expect(text).toContain('Match status: new');
    expect(text).toContain('I am building MemoVault this quarter.');
  });

  it('renders an empty-list placeholder when there are no suggestions', () => {
    const text = buildProjectSuggestionsClipboardText([]);
    expect(text).toContain('Suggested Projects (0 items)');
    expect(text).toContain('(empty)');
  });
});

describe('buildLocationSuggestionsClipboardText', () => {
  it('includes place type, mentions, confidence, and context', () => {
    const text = buildLocationSuggestionsClipboardText([
      {
        id: 'loc-sugg-1',
        name: 'Northwind Depot',
        type: 'workplace',
        mentionCount: 4,
        confidence: 0.88,
        source: 'chat_detect',
        status: 'new',
        match_status: 'new',
        context: 'Mentioned as a recurring worksite after onboarding.',
      },
    ]);

    expect(text).toContain('Suggested Places (1 item)');
    expect(text).toContain('1. Northwind Depot');
    expect(text).toContain('Type: workplace');
    expect(text).toContain('Mentions: 4');
    expect(text).toContain('Confidence: 88%');
    expect(text).toContain('Mentioned as a recurring worksite after onboarding.');
  });

  it('renders an empty-list placeholder when there are no suggestions', () => {
    const text = buildLocationSuggestionsClipboardText([]);
    expect(text).toContain('Suggested Places (0 items)');
    expect(text).toContain('(empty)');
  });
});

describe('buildLocationDuplicatesClipboardText', () => {
  it('includes match type, confidence, and card names for each group', () => {
    const text = buildLocationDuplicatesClipboardText([
      {
        match_type: 'alias',
        canonical_name: "Jamie's House",
        confidence: 0.9,
        reason: 'residence alias',
        label: 'Private residence alias',
        locations: [
          { id: 'loc-1', name: "Jamie's House", type: 'house', metadata: { aliases: ['Home'] } },
          { id: 'loc-2', name: 'Anaheim Family Home', type: 'house' },
        ],
      },
    ]);

    expect(text).toContain('Duplicate Places (1 item)');
    expect(text).toContain("1. Jamie's House");
    expect(text).toContain('Match type: alias');
    expect(text).toContain('Confidence: 90%');
    expect(text).toContain("Cards: Jamie's House, Anaheim Family Home");
    expect(text).toContain('Existing aliases: Home');
  });

  it('renders an empty-list placeholder when there are no groups', () => {
    const text = buildLocationDuplicatesClipboardText([]);
    expect(text).toContain('Duplicate Places (0 items)');
    expect(text).toContain('(empty)');
  });
});

describe('buildDatingRomanceClipboardText', () => {
  it('includes relationship scores, flags, dates, and evidence signals', () => {
    const text = buildDatingRomanceClipboardText([
      {
        id: 'relationship-1',
        person_id: 'character-1',
        person_type: 'character',
        person_name: 'Jamie',
        relationship_type: 'dating',
        status: 'active',
        is_current: true,
        affection_score: 0.88,
        emotional_intensity: 0.75,
        compatibility_score: 0.82,
        relationship_health: 0.79,
        is_situationship: false,
        exclusivity_status: 'exclusive',
        strengths: ['communication'],
        weaknesses: ['distance'],
        pros: ['supportive'],
        cons: ['different schedules'],
        red_flags: [],
        green_flags: ['clear boundaries'],
        start_date: '2026-03-01T00:00:00.000Z',
        created_at: '2026-03-02T00:00:00.000Z',
        metadata: {
          signals: {
            attachment_intensity: 0.7,
            evidence_strength: 0.9,
            signal_strength: 'high',
          },
        },
      },
    ]);

    expect(text).toContain('Dating and Romance (1 item)');
    expect(text).toContain('1. Jamie');
    expect(text).toContain('Compatibility: 82%');
    expect(text).toContain('Green flags: clear boundaries');
    expect(text).toContain('Attachment intensity: 70%');
    expect(text).toContain('Signal strength: high');
  });
});
