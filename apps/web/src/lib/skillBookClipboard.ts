import type { Skill } from '../types/skill';

import { buildListClipboardText } from './listClipboard';
import { readSkillProfile } from './skillProfile';

export function buildSkillBookClipboardText(skills: Skill[]): string {
  return buildListClipboardText({
    title: 'Skills Book',
    items: skills.map((skill) => {
      const profile = readSkillProfile(skill.metadata);
      const learnedFrom = skill.metadata.skill_details?.learned_from
        ?.map((source) => source.character_name)
        .filter(Boolean);
      const practicedWith = skill.metadata.skill_details?.practiced_with
        ?.map((source) => source.character_name)
        .filter(Boolean);
      const places = [
        ...(skill.metadata.skill_details?.learned_at ?? []).map((place) => place.location_name),
        ...(skill.metadata.skill_details?.practiced_at ?? []).map((place) => place.location_name),
      ].filter(Boolean);

      return {
        heading: skill.skill_name,
        fields: [
          { label: 'Id', value: skill.id },
          { label: 'Category', value: skill.skill_category },
          { label: 'Type', value: profile?.skill_type },
          { label: 'Level', value: skill.current_level },
          { label: 'XP', value: skill.total_xp },
          { label: 'XP to next level', value: skill.xp_to_next_level },
          { label: 'Proficiency', value: profile?.proficiency },
          { label: 'Enjoyment', value: profile?.enjoyment },
          { label: 'Practice count', value: skill.practice_count },
          { label: 'Usage frequency', value: profile?.usage_frequency },
          { label: 'Trajectory', value: profile?.trajectory },
          { label: 'Monetization', value: profile?.monetization },
          { label: 'Active', value: skill.is_active },
          { label: 'Auto detected', value: skill.auto_detected },
          { label: 'Confidence', value: skill.confidence_score },
          { label: 'First mentioned', value: skill.first_mentioned_at },
          { label: 'Last practiced', value: skill.last_practiced_at ?? profile?.last_used_at },
          { label: 'Related jobs', value: profile?.related_jobs },
          { label: 'Related projects', value: profile?.related_projects },
          { label: 'Related skills', value: profile?.related_skill_names },
          { label: 'Learned from', value: learnedFrom },
          { label: 'Practiced with', value: practicedWith },
          { label: 'Places', value: places },
          { label: 'Origin', value: profile?.origin_story },
        ],
        body: profile?.story_summary?.trim() || skill.description?.trim() || undefined,
      };
    }),
  });
}
