import type { ConversationScenario } from './types';

/**
 * Rich multi-turn conversation scripts for simulation.
 * Each scenario exercises entity detection, relationships, and situation tagging.
 */
export const CONVERSATION_SCENARIOS: ConversationScenario[] = [
  {
    id: 'weekend-presence',
    title: 'Weekend with Alex',
    subtitle: 'Romance · presence',
    domains: ['romance', 'relationships', 'place'],
    description: 'A reset weekend that deepens a romantic connection at the coast.',
    situationTags: ['weekend_trip', 'quality_time', 'beach_day'],
    turns: [
      {
        role: 'user',
        content:
          'Alex and I had a really good weekend at Mission Beach — felt like we were actually present with each other for once.',
      },
      {
        role: 'assistant',
        content:
          'That sounds like a meaningful reset. Presence often signals the relationship still has room to deepen when life gets noisy.',
      },
      {
        role: 'user',
        content:
          'We talked about maybe doing monthly beach days. I want LoreBook to remember Alex as my romantic partner, not just a name in chat.',
      },
    ],
  },
  {
    id: 'career-connector',
    title: 'Robotics opening',
    subtitle: 'Career · network',
    domains: ['career', 'social'],
    description: 'A friend surfaces a deployment role at a robotics company.',
    situationTags: ['job_lead', 'network_intro', 'career_decision'],
    turns: [
      {
        role: 'user',
        content:
          'Marcus mentioned Armstrong Robotics might have a field deployment tech opening — wondering if it fits my trajectory.',
      },
      {
        role: 'assistant',
        content: 'Worth tracking. Marcus keeps showing up as a connector in your professional network.',
      },
      {
        role: 'user',
        content:
          'I practiced my technical storytelling skill last night. If I interview, I want my skill profile linked to this thread.',
      },
    ],
  },
  {
    id: 'family-return',
    title: 'Tía Maria visit',
    subtitle: 'Family · place',
    domains: ['family', 'place', 'relationships'],
    description: 'Returning to San Diego to reconnect with extended family.',
    situationTags: ['family_visit', 'homecoming', 'intergenerational'],
    turns: [
      {
        role: 'user',
        content: 'I visited Tía Maria in San Diego last month. She told stories about abuela I had never heard.',
      },
      {
        role: 'assistant',
        content: 'Family visits like that often unlock lineage you cannot get from photos alone.',
      },
      {
        role: 'user',
        content: 'San Diego still feels like a second home — Mission Beach especially. I want places and people linked.',
      },
    ],
  },
  {
    id: 'crew-formation',
    title: 'Northwind crew',
    subtitle: 'Social · group',
    domains: ['social', 'creative'],
    description: 'A friend group coalesces around a shared creative project.',
    situationTags: ['new_group', 'collaboration', 'creative_sprint'],
    turns: [
      {
        role: 'user',
        content:
          'Jamie, Marcus, and I started meeting at Northwind Labs on Thursdays — feels like a real crew forming around our side project.',
      },
      {
        role: 'assistant',
        content: 'Repeated co-location plus shared output is how informal groups become durable in your story graph.',
      },
      {
        role: 'user',
        content: 'We should track Northwind as a group, not just three separate people.',
      },
    ],
  },
  {
    id: 'health-reset',
    title: 'Morning routine',
    subtitle: 'Health · identity',
    domains: ['health', 'identity'],
    description: 'Building a sustainable morning practice after burnout.',
    situationTags: ['habit_building', 'recovery', 'self_care'],
    turns: [
      {
        role: 'user',
        content:
          'I have been running at Mission Beach before work and journaling for ten minutes. My stress baseline feels lower.',
      },
      {
        role: 'assistant',
        content: 'Place-linked routines anchor identity shifts — the beach becomes part of the recovery arc.',
      },
      {
        role: 'user',
        content: 'Log this as a health turning point. I want future me to see when the pattern started.',
      },
    ],
  },
  {
    id: 'breakup-processing',
    title: 'After the breakup',
    subtitle: 'Romance · reflection',
    domains: ['romance', 'relationships', 'identity'],
    description: 'Processing the end of a relationship with clarity.',
    situationTags: ['breakup', 'grief', 'closure'],
    turns: [
      {
        role: 'user',
        content:
          'Kelly and I finally talked last night. We are not getting back together — I feel sad but also relieved.',
      },
      {
        role: 'assistant',
        content: 'Closure conversations are relationship moments even when the arc ends.',
      },
      {
        role: 'user',
        content: 'Keep Kelly in my romantic history but mark the relationship as ended. I do not want her erased.',
      },
    ],
  },
  {
    id: 'skill-milestone',
    title: 'Presentation win',
    subtitle: 'Career · skill',
    domains: ['career', 'creative'],
    description: 'Public speaking breakthrough at work.',
    situationTags: ['presentation', 'skill_milestone', 'recognition'],
    turns: [
      {
        role: 'user',
        content:
          'I nailed the Armstrong Robotics demo yesterday. Marcus said it was the clearest technical story he has heard from me.',
      },
      {
        role: 'assistant',
        content: 'That ties your public speaking skill to a concrete professional win.',
      },
      {
        role: 'user',
        content: 'Bump my public speaking skill confidence and link Marcus and Armstrong to this moment.',
      },
    ],
  },
  {
    id: 'city-move',
    title: 'Considering San Diego',
    subtitle: 'Place · identity',
    domains: ['place', 'identity', 'family'],
    description: 'Weighing a move closer to family and the coast.',
    situationTags: ['relocation', 'life_decision', 'place_attachment'],
    turns: [
      {
        role: 'user',
        content:
          'Tía Maria asked if I would ever move back to San Diego. I keep thinking about Mission Beach and being near family.',
      },
      {
        role: 'assistant',
        content: 'Relocation decisions pull together people, places, and identity in one thread.',
      },
      {
        role: 'user',
        content: 'Track this as an open life decision connecting San Diego, Tía Maria, and my future self.',
      },
    ],
  },
  {
    id: 'mentor-thread',
    title: 'Marcus as mentor',
    subtitle: 'Career · relationships',
    domains: ['career', 'relationships', 'social'],
    description: 'A peer evolves into an informal mentor.',
    situationTags: ['mentorship', 'professional_growth'],
    turns: [
      {
        role: 'user',
        content:
          'Marcus walked me through how he scopes deployments at Armstrong Robotics. It felt more mentor than friend today.',
      },
      {
        role: 'assistant',
        content: 'Mentorship edges often emerge from repeated professional co-mentions.',
      },
    ],
  },
  {
    id: 'creative-launch',
    title: 'Side project ship',
    subtitle: 'Creative · group',
    domains: ['creative', 'social', 'career'],
    description: 'The Northwind crew ships a v1.',
    situationTags: ['launch', 'creative_output', 'team_win'],
    turns: [
      {
        role: 'user',
        content:
          'Jamie pushed the last commit — our Northwind Labs project is live. Marcus brought Armstrong people to the launch call.',
      },
      {
        role: 'assistant',
        content: 'Launch moments bind groups, skills, and professional networks into one narrative atom.',
      },
    ],
  },
  {
    id: 'new-friendship',
    title: 'Jamie at the gym',
    subtitle: 'Social · identity',
    domains: ['social', 'relationships', 'health'],
    description: 'A casual acquaintance becomes a real friend.',
    situationTags: ['new_friend', 'shared_routine', 'trust_building'],
    turns: [
      {
        role: 'user',
        content:
          'Jamie and I started training together at Mission Beach — we went from gym small talk to actually opening up about work stress.',
      },
      {
        role: 'assistant',
        content: 'Shared routines are how acquaintances graduate into people your story remembers.',
      },
      {
        role: 'user',
        content: 'I want Jamie tracked as a close friend, not just someone from Northwind.',
      },
    ],
  },
  {
    id: 'work-boundary',
    title: 'Saying no at Armstrong',
    subtitle: 'Career · identity',
    domains: ['career', 'identity', 'health'],
    description: 'Setting a boundary after burnout at work.',
    situationTags: ['burnout', 'boundary', 'self_advocacy'],
    turns: [
      {
        role: 'user',
        content:
          'I told my manager at Armstrong Robotics I cannot take another deployment this month. I was shaking but it felt right.',
      },
      {
        role: 'assistant',
        content: 'Boundary moments are identity events — they rewrite how work fits your life arc.',
      },
      {
        role: 'user',
        content: 'Log this as a career turning point tied to my health reset thread.',
      },
    ],
  },
  {
    id: 'travel-memory',
    title: 'First time in San Diego',
    subtitle: 'Place · family',
    domains: ['place', 'family', 'relationships'],
    description: 'A childhood trip that still shapes how you feel about the coast.',
    situationTags: ['travel', 'childhood_memory', 'place_attachment'],
    turns: [
      {
        role: 'user',
        content:
          'Tía Maria showed me Mission Beach when I was twelve — that trip is why San Diego still feels like home in my chest.',
      },
      {
        role: 'assistant',
        content: 'Early place memories often anchor decades of family and relocation threads.',
      },
    ],
  },
  {
    id: 'grief-wave',
    title: 'Missing abuela',
    subtitle: 'Family · identity',
    domains: ['family', 'identity', 'relationships'],
    description: 'Processing grief after learning family stories.',
    situationTags: ['grief', 'intergenerational', 'memory_keeping'],
    turns: [
      {
        role: 'user',
        content:
          'After Tía Maria told me about abuela, I cried on the drive back from San Diego. I wish I had asked more while she was alive.',
      },
      {
        role: 'assistant',
        content: 'Grief and lineage often arrive together when family stories finally surface.',
      },
      {
        role: 'user',
        content: 'Keep abuela in my family book even though she is gone — she is part of who I am.',
      },
    ],
  },
];

export function getScenarioById(id: string): ConversationScenario | undefined {
  return CONVERSATION_SCENARIOS.find((s) => s.id === id);
}
