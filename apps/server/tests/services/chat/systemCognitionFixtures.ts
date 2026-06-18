import type { SelfModelConcept } from '../../../src/services/chat/lorebookSelfModelService';

export type MetaQueryCase = {
  message: string;
  strength: 'strong' | 'soft';
  concepts: SelfModelConcept[];
};

/** Strong meta queries — should short-circuit without LLM. */
export const STRONG_META_CASES: MetaQueryCase[] = [
  {
    message: 'What is LoreBook?',
    strength: 'strong',
    concepts: ['product_identity'],
  },
  {
    message: "What's LoreBook?",
    strength: 'strong',
    concepts: ['product_identity'],
  },
  {
    message: 'Tell me about LoreBook',
    strength: 'strong',
    concepts: ['product_identity'],
  },
  {
    message: 'How does this app work?',
    strength: 'strong',
    concepts: ['product_identity', 'memory_lifecycle', 'surfaces'],
  },
  {
    message: 'How does LoreBook work?',
    strength: 'strong',
    concepts: ['product_identity', 'memory_lifecycle', 'surfaces'],
  },
  {
    message: 'How do you remember things?',
    strength: 'strong',
    concepts: ['memory_lifecycle', 'extraction_pipeline'],
  },
  {
    message: 'How does memory work?',
    strength: 'strong',
    concepts: ['memory_lifecycle', 'extraction_pipeline'],
  },
  {
    message: 'What gets saved when I chat?',
    strength: 'strong',
    concepts: ['memory_lifecycle', 'extraction_pipeline'],
  },
  {
    message: 'What happens when I share something with you?',
    strength: 'strong',
    concepts: ['memory_lifecycle', 'extraction_pipeline'],
  },
  {
    message: 'Where can I see my memories?',
    strength: 'strong',
    concepts: ['surfaces'],
  },
  {
    message: 'Where do I find my characters?',
    strength: 'strong',
    concepts: ['surfaces'],
  },
];

/** Soft meta queries — inject HOW LOREBOOK WORKS prompt block. */
export const SOFT_META_CASES: MetaQueryCase[] = [
  {
    message: 'Am I in my Characters book?',
    strength: 'soft',
    concepts: ['user_is_narrator'],
  },
  {
    message: 'Did you add me as a character?',
    strength: 'soft',
    concepts: ['user_is_narrator'],
  },
  {
    message: 'How do you recall information?',
    strength: 'soft',
    concepts: ['retrieval', 'limitations'],
  },
  {
    message: "Why can't you remember everything?",
    strength: 'soft',
    concepts: ['retrieval', 'limitations'],
  },
  {
    message: "What can't you do?",
    strength: 'soft',
    concepts: ['limitations', 'extraction_pipeline'],
  },
];

/** Must never be classified as product meta — routed to recall/testing instead. */
export const NON_META_CASES: string[] = [
  'What do you know about me?',
  'What do you know about my family?',
  'What have you learned about my life?',
  'Who are the people in my story?',
  'Tell me about my grandmother',
  'Did you save Grandma Rose?',
  'What did I say earlier?',
  'I had a rough day at work',
  'Nova texted me again',
  'Will you remember this conversation?',
];
