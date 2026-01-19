// =====================================================
// CLASSIFICATION TEST SAMPLES
// Purpose: Test data for classification accuracy tests
// =====================================================

import type { KnowledgeType } from '../types';

export interface ClassificationSample {
  text: string;
  expectedType: KnowledgeType;
  description: string;
}

export const classificationSamples: ClassificationSample[] = [
  // =====================================================
  // EXPERIENCE SAMPLES (20)
  // =====================================================
  {
    text: 'I went to the store yesterday',
    expectedType: 'EXPERIENCE',
    description: 'Simple past tense action',
  },
  {
    text: 'We met at the coffee shop',
    expectedType: 'EXPERIENCE',
    description: 'Past tense with "we"',
  },
  {
    text: 'She visited me last week',
    expectedType: 'EXPERIENCE',
    description: 'Third person past tense',
  },
  {
    text: 'I completed the project on time',
    expectedType: 'EXPERIENCE',
    description: 'Completed action',
  },
  {
    text: 'They attended the conference',
    expectedType: 'EXPERIENCE',
    description: 'Plural past tense',
  },
  {
    text: 'I finished reading the book',
    expectedType: 'EXPERIENCE',
    description: 'Finished action',
  },
  {
    text: 'He started a new job',
    expectedType: 'EXPERIENCE',
    description: 'Started action',
  },
  {
    text: 'I achieved my goal',
    expectedType: 'EXPERIENCE',
    description: 'Achieved action',
  },
  {
    text: 'We accomplished the task together',
    expectedType: 'EXPERIENCE',
    description: 'Accomplished action',
  },
  {
    text: 'I had a great time at the party',
    expectedType: 'EXPERIENCE',
    description: 'Had action',
  },
  {
    text: 'She got a promotion',
    expectedType: 'EXPERIENCE',
    description: 'Got action',
  },
  {
    text: 'I received a gift',
    expectedType: 'EXPERIENCE',
    description: 'Received action',
  },
  {
    text: 'We gave a presentation',
    expectedType: 'EXPERIENCE',
    description: 'Gave action',
  },
  {
    text: 'I took a walk in the park',
    expectedType: 'EXPERIENCE',
    description: 'Took action',
  },
  {
    text: 'He made dinner for us',
    expectedType: 'EXPERIENCE',
    description: 'Made action',
  },
  {
    text: 'I created a new project',
    expectedType: 'EXPERIENCE',
    description: 'Created action',
  },
  {
    text: 'We built a house',
    expectedType: 'EXPERIENCE',
    description: 'Built action',
  },
  {
    text: 'I wrote a letter',
    expectedType: 'EXPERIENCE',
    description: 'Wrote action',
  },
  {
    text: 'She read the entire book',
    expectedType: 'EXPERIENCE',
    description: 'Read action',
  },
  {
    text: 'I watched a movie',
    expectedType: 'EXPERIENCE',
    description: 'Watched action',
  },

  // =====================================================
  // FEELING SAMPLES (20)
  // =====================================================
  {
    text: 'I feel happy today',
    expectedType: 'FEELING',
    description: 'Simple feeling statement',
  },
  {
    text: 'I am sad about the news',
    expectedType: 'FEELING',
    description: 'Am + emotion',
  },
  {
    text: 'I\'m excited for the trip',
    expectedType: 'FEELING',
    description: 'I\'m + emotion',
  },
  {
    text: 'Feeling nervous about the interview',
    expectedType: 'FEELING',
    description: 'Feeling + emotion',
  },
  {
    text: 'I felt anxious yesterday',
    expectedType: 'FEELING',
    description: 'Felt + emotion',
  },
  {
    text: 'She feels confident',
    expectedType: 'FEELING',
    description: 'Feels + emotion',
  },
  {
    text: 'I am worried about the test',
    expectedType: 'FEELING',
    description: 'Am + worried',
  },
  {
    text: 'I feel scared of heights',
    expectedType: 'FEELING',
    description: 'Feel + scared',
  },
  {
    text: 'I\'m afraid of spiders',
    expectedType: 'FEELING',
    description: 'I\'m + afraid',
  },
  {
    text: 'Feeling confident in my abilities',
    expectedType: 'FEELING',
    description: 'Feeling + confident',
  },
  {
    text: 'I am proud of my work',
    expectedType: 'FEELING',
    description: 'Am + proud',
  },
  {
    text: 'I feel ashamed of my mistake',
    expectedType: 'FEELING',
    description: 'Feel + ashamed',
  },
  {
    text: 'I\'m embarrassed by my behavior',
    expectedType: 'FEELING',
    description: 'I\'m + embarrassed',
  },
  {
    text: 'Feeling disappointed with the results',
    expectedType: 'FEELING',
    description: 'Feeling + disappointed',
  },
  {
    text: 'I am frustrated with the delay',
    expectedType: 'FEELING',
    description: 'Am + frustrated',
  },
  {
    text: 'I feel grateful for the help',
    expectedType: 'FEELING',
    description: 'Feel + grateful',
  },
  {
    text: 'I\'m thankful for the opportunity',
    expectedType: 'FEELING',
    description: 'I\'m + thankful',
  },
  {
    text: 'Feeling relieved after the exam',
    expectedType: 'FEELING',
    description: 'Feeling + relieved',
  },
  {
    text: 'I am stressed about work',
    expectedType: 'FEELING',
    description: 'Am + stressed',
  },
  {
    text: 'I feel overwhelmed by everything',
    expectedType: 'FEELING',
    description: 'Feel + overwhelmed',
  },

  // =====================================================
  // BELIEF SAMPLES (20)
  // =====================================================
  {
    text: 'I believe it will rain tomorrow',
    expectedType: 'BELIEF',
    description: 'I believe statement',
  },
  {
    text: 'I think she is avoiding me',
    expectedType: 'BELIEF',
    description: 'I think statement',
  },
  {
    text: 'I assume the meeting is cancelled',
    expectedType: 'BELIEF',
    description: 'I assume statement',
  },
  {
    text: 'I suspect something is wrong',
    expectedType: 'BELIEF',
    description: 'I suspect statement',
  },
  {
    text: 'I guess we\'ll find out soon',
    expectedType: 'BELIEF',
    description: 'I guess statement',
  },
  {
    text: 'I imagine it will be fun',
    expectedType: 'BELIEF',
    description: 'I imagine statement',
  },
  {
    text: 'Supposedly, the event is free',
    expectedType: 'BELIEF',
    description: 'Supposedly marker',
  },
  {
    text: 'Apparently, she got the job',
    expectedType: 'BELIEF',
    description: 'Apparently marker',
  },
  {
    text: 'Allegedly, he was involved',
    expectedType: 'BELIEF',
    description: 'Allegedly marker',
  },
  {
    text: 'Reportedly, the company is closing',
    expectedType: 'BELIEF',
    description: 'Reportedly marker',
  },
  {
    text: 'I heard she moved to New York',
    expectedType: 'BELIEF',
    description: 'I heard marker',
  },
  {
    text: 'I was told the meeting is at 3pm',
    expectedType: 'BELIEF',
    description: 'I was told marker',
  },
  {
    text: 'Someone said it\'s cancelled',
    expectedType: 'BELIEF',
    description: 'Someone said marker',
  },
  {
    text: 'They said it will be ready soon',
    expectedType: 'BELIEF',
    description: 'They said marker',
  },
  {
    text: 'People say it\'s a good restaurant',
    expectedType: 'BELIEF',
    description: 'People say marker',
  },
  {
    text: 'There\'s a rumor about layoffs',
    expectedType: 'BELIEF',
    description: 'Rumor marker',
  },
  {
    text: 'I heard rumors about the merger',
    expectedType: 'BELIEF',
    description: 'Rumors marker',
  },
  {
    text: 'There\'s gossip about the breakup',
    expectedType: 'BELIEF',
    description: 'Gossip marker',
  },
  {
    text: 'I think maybe it will work',
    expectedType: 'BELIEF',
    description: 'I think + maybe',
  },
  {
    text: 'I believe probably it\'s true',
    expectedType: 'BELIEF',
    description: 'I believe + probably',
  },

  // =====================================================
  // FACT SAMPLES (20)
  // =====================================================
  {
    text: 'The sky is blue',
    expectedType: 'FACT',
    description: 'Simple declarative statement',
  },
  {
    text: 'Water boils at 100 degrees Celsius',
    expectedType: 'FACT',
    description: 'Scientific fact',
  },
  {
    text: 'The meeting is at 3pm',
    expectedType: 'FACT',
    description: 'Scheduled fact',
  },
  {
    text: 'She is a doctor',
    expectedType: 'FACT',
    description: 'Identity fact',
  },
  {
    text: 'The store is closed on Sundays',
    expectedType: 'FACT',
    description: 'Operational fact',
  },
  {
    text: 'He has three children',
    expectedType: 'FACT',
    description: 'Possession fact',
  },
  {
    text: 'The project was completed last week',
    expectedType: 'FACT',
    description: 'Past fact',
  },
  {
    text: 'It will rain tomorrow',
    expectedType: 'FACT',
    description: 'Future fact',
  },
  {
    text: 'The book has 300 pages',
    expectedType: 'FACT',
    description: 'Quantitative fact',
  },
  {
    text: 'Paris is the capital of France',
    expectedType: 'FACT',
    description: 'Geographic fact',
  },
  {
    text: 'The deadline is Friday',
    expectedType: 'FACT',
    description: 'Temporal fact',
  },
  {
    text: 'She lives in California',
    expectedType: 'FACT',
    description: 'Location fact',
  },
  {
    text: 'The company was founded in 2020',
    expectedType: 'FACT',
    description: 'Historical fact',
  },
  {
    text: 'The test is multiple choice',
    expectedType: 'FACT',
    description: 'Format fact',
  },
  {
    text: 'He can speak three languages',
    expectedType: 'FACT',
    description: 'Ability fact',
  },
  {
    text: 'The event is free to attend',
    expectedType: 'FACT',
    description: 'Cost fact',
  },
  {
    text: 'The restaurant serves Italian food',
    expectedType: 'FACT',
    description: 'Service fact',
  },
  {
    text: 'The movie is two hours long',
    expectedType: 'FACT',
    description: 'Duration fact',
  },
  {
    text: 'The office is on the third floor',
    expectedType: 'FACT',
    description: 'Location detail fact',
  },
  {
    text: 'The class starts at 9am',
    expectedType: 'FACT',
    description: 'Time fact',
  },

  // =====================================================
  // DECISION SAMPLES (10)
  // =====================================================
  {
    text: 'I decided to quit my job',
    expectedType: 'DECISION',
    description: 'I decided statement',
  },
  {
    text: 'I\'m going to start a business',
    expectedType: 'DECISION',
    description: 'I\'m going to statement',
  },
  {
    text: 'I will move to a new city',
    expectedType: 'DECISION',
    description: 'I will statement',
  },
  {
    text: 'I\'m planning to travel next year',
    expectedType: 'DECISION',
    description: 'I\'m planning statement',
  },
  {
    text: 'I chose to study computer science',
    expectedType: 'DECISION',
    description: 'I chose statement',
  },
  {
    text: 'I selected the blue option',
    expectedType: 'DECISION',
    description: 'I selected statement',
  },
  {
    text: 'I picked the first choice',
    expectedType: 'DECISION',
    description: 'I picked statement',
  },
  {
    text: 'I opted for the cheaper option',
    expectedType: 'DECISION',
    description: 'I opted statement',
  },
  {
    text: 'My decision is to wait',
    expectedType: 'DECISION',
    description: 'Decision noun',
  },
  {
    text: 'I need to decide soon',
    expectedType: 'DECISION',
    description: 'Decide verb',
  },

  // =====================================================
  // QUESTION SAMPLES (10)
  // =====================================================
  {
    text: 'What time is the meeting?',
    expectedType: 'QUESTION',
    description: 'What question',
  },
  {
    text: 'When will it be ready?',
    expectedType: 'QUESTION',
    description: 'When question',
  },
  {
    text: 'Where is the office?',
    expectedType: 'QUESTION',
    description: 'Where question',
  },
  {
    text: 'Who is coming to the party?',
    expectedType: 'QUESTION',
    description: 'Who question',
  },
  {
    text: 'Why did you do that?',
    expectedType: 'QUESTION',
    description: 'Why question',
  },
  {
    text: 'How do I get there?',
    expectedType: 'QUESTION',
    description: 'How question',
  },
  {
    text: 'Which option should I choose?',
    expectedType: 'QUESTION',
    description: 'Which question',
  },
  {
    text: 'Should I go to the party?',
    expectedType: 'QUESTION',
    description: 'Should question',
  },
  {
    text: 'Can you help me?',
    expectedType: 'QUESTION',
    description: 'Can question',
  },
  {
    text: 'Will it rain tomorrow?',
    expectedType: 'QUESTION',
    description: 'Will question',
  },

  // =====================================================
  // AMBIGUOUS/MIXED SAMPLES (10)
  // =====================================================
  {
    text: 'I went to the store and I feel happy',
    expectedType: 'EXPERIENCE', // First pattern match wins
    description: 'Mixed EXPERIENCE + FEELING',
  },
  {
    text: 'I think I went to the store',
    expectedType: 'BELIEF', // BELIEF pattern comes before EXPERIENCE
    description: 'BELIEF + EXPERIENCE',
  },
  {
    text: 'I believe the meeting is at 3pm',
    expectedType: 'BELIEF', // BELIEF pattern comes before FACT
    description: 'BELIEF + FACT',
  },
  {
    text: 'I feel like I should go',
    expectedType: 'FEELING', // FEELING pattern comes first
    description: 'FEELING + DECISION',
  },
  {
    text: 'I\'m pretty sure I went yesterday',
    expectedType: 'EXPERIENCE', // EXPERIENCE pattern comes first
    description: 'Uncertain EXPERIENCE',
  },
  {
    text: 'Maybe I think it will work',
    expectedType: 'BELIEF', // BELIEF pattern comes first
    description: 'Uncertain BELIEF',
  },
  {
    text: 'I decided and I feel good about it',
    expectedType: 'DECISION', // DECISION pattern comes first
    description: 'DECISION + FEELING',
  },
  {
    text: 'What should I do? I think maybe wait',
    expectedType: 'QUESTION', // QUESTION pattern comes first
    description: 'QUESTION + BELIEF',
  },
  {
    text: 'The meeting is at 3pm, I believe',
    expectedType: 'FACT', // FACT pattern comes before BELIEF
    description: 'FACT + BELIEF (trailing)',
  },
  {
    text: 'I went, I think, to the store',
    expectedType: 'EXPERIENCE', // EXPERIENCE pattern comes first
    description: 'EXPERIENCE + BELIEF (embedded)',
  },
];
