/**
 * Chat lifecycle simulation — drives thread list + conversation UI through the
 * same mutation paths as production (createThread, mutateThreadMessages, touchActivity).
 *
 * Used for animation QA in demo/dev; gated via isChatLifecycleSimulationEnabled().
 * Production can enable with VITE_CHAT_LIFECYCLE_SIM=true for staged preview testing.
 * The React hook additionally requires a guest or demo runtime.
 */

import type { Message } from '../message/ChatMessage';
import type { ChatThread } from '../hooks/useChatThreads';
import { streamDemoFocusReply } from '../../../lib/demoFocusChat';
import { buildDemoChatResponse, deriveDemoThreadTitle, type DemoChatLoadingStage } from '../../../services/demoChatSimulation';
import { deriveTitleFromFirstUserMessage } from '../utils/threadTitleUtils';
import { shouldUseMockData } from '../../../hooks/useShouldUseMockData';

export type ChatLifecycleAdapter = {
  createThread: () => string;
  selectThread: (threadId: string) => void;
  getActiveThreadId: () => string | null;
  getThreads: () => ChatThread[];
  appendMessage: (threadId: string, message: Message, opts?: { touchActivity?: boolean }) => void;
  updateMessage: (
    threadId: string,
    messageId: string,
    updates: Partial<Message>,
    opts?: { touchActivity?: boolean }
  ) => void;
  updateThread: (
    threadId: string,
    updates: Partial<Pick<ChatThread, 'title' | 'subtitle' | 'dominantEntities'>> & { touchActivity?: boolean }
  ) => void;
  navigateToThread: (threadId: string) => void;
  /** Full send path (useChat.sendMessage) — optional; used when testing production streaming. */
  sendMessage?: (text: string) => Promise<void>;
  onLoadingStage?: (stage: DemoChatLoadingStage, progress: number) => void;
};

export type ChatLifecycleStep =
  | { type: 'wait'; ms: number }
  | { type: 'createThread'; select?: boolean }
  | { type: 'selectThread'; threadId: 'active' | 'first' | 'second' | string }
  | { type: 'navigate'; threadId: 'active' | string }
  | { type: 'userMessage'; content: string; touchActivity?: boolean }
  | {
      type: 'assistantStream';
      content: string;
      chunkSize?: number;
      chunkDelayMs?: number;
      /** Structured production-style result fields rendered after streaming completes. */
      result?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'timestamp' | 'isStreaming'>>;
    }
  | { type: 'updateThreadMeta'; title?: string; subtitle?: string; dominantEntities?: string[]; touchActivity?: boolean }
  | { type: 'sendViaComposer'; content: string };

export type ChatLifecycleScenario = {
  id: string;
  label: string;
  description: string;
  steps: ChatLifecycleStep[];
};

export type ChatLifecycleRunState = {
  scenarioId: string | null;
  running: boolean;
  stepIndex: number;
  stepLabel: string | null;
};

const STAGE_SEQUENCE: Array<{ stage: DemoChatLoadingStage; progress: number; ms: number }> = [
  { stage: 'analyzing', progress: 18, ms: 520 },
  { stage: 'searching', progress: 38, ms: 560 },
  { stage: 'connecting', progress: 58, ms: 500 },
  { stage: 'reasoning', progress: 74, ms: 480 },
  { stage: 'generating', progress: 88, ms: 400 },
];

/** Breathing room after a reply before the simulated user continues. */
const SHOWCASE_TURN_PAUSE_MS = 1_800;

export function isChatLifecycleSimulationEnabled(): boolean {
  const flag = import.meta.env.VITE_CHAT_LIFECYCLE_SIM as string | undefined;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return import.meta.env.DEV || shouldUseMockData();
}

export const CHAT_LIFECYCLE_SCENARIOS: ChatLifecycleScenario[] = [
  {
    id: 'party-story',
    label: 'Party story',
    description: 'Three turns: event capture, people and place linking, emotion, recall, and timeline.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 600 },
      {
        type: 'userMessage',
        content: 'I went to Northwind Arts Night at Harborlight Hall last night with Priya and Jordan. It was packed but honestly amazing.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'That sounds like the kind of night that leaves you tired but still buzzing the next day. Being packed into Harborlight Hall could have been exhausting, but calling it “honestly amazing” makes me think the people you were with mattered more than the crowd.\n\nWas there one moment—or one person—that made the night feel especially worth it?',
        result: {
          mentionedEntities: [
            { id: 'sim-event-northwind-arts', name: 'Northwind Arts Night', type: 'event', loreKind: 'event' },
            { id: 'sim-place-harborlight', name: 'Harborlight Hall', type: 'location', loreKind: 'place' },
            { id: 'sim-person-priya', name: 'Priya', type: 'character', loreKind: 'person' },
            { id: 'sim-person-jordan', name: 'Jordan', type: 'character', loreKind: 'person' },
          ],
          connections: ['Event · Northwind Arts Night', 'Place · Harborlight Hall', 'People · Priya and Jordan'],
          timelineUpdates: ['📅 Added Northwind Arts Night · last night', '📍 Linked Harborlight Hall'],
          extractedDates: [{ date: 'last night', context: 'Northwind Arts Night at Harborlight Hall' }],
          creationOutcomes: [
            { mention: 'Northwind Arts Night', action: 'create', entityId: 'sim-event-northwind-arts', entityName: 'Northwind Arts Night', authority: 'core' },
            { mention: 'Priya', action: 'merge', entityId: 'sim-person-priya', entityName: 'Priya', authority: 'core' },
          ],
          creationOutcomeSummary: 'Created the event and linked known people with correction controls.',
          continuityAcknowledged: { signals: ['emotion', 'social event'], entityHints: ['Priya linked', 'Jordan linked', 'Harborlight Hall linked'], timelineSignificant: true },
          continuityWarnings: ['Excitement and overwhelm are observations from this night, not permanent personality traits.'],
          strategicGuidance: 'Notice which people and conditions helped a normally draining environment feel energizing.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Northwind Arts Night', snippet: 'Harborlight Hall with Priya and Jordan' }],
          suggestedActions: [{ id: 'party-people', label: 'Tell me about Priya', kind: 'prefill', prompt: 'I spent the most time with Priya because…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Mostly Priya. We danced for hours, and she introduced me to her friend Leo from Port Aurora.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'Dancing with Priya for hours sounds like more than just being at the same party—you two kept choosing to stay in each other’s orbit. And being introduced to Leo suggests she was bringing you into her social world, at least in that moment. That does not automatically mean romance, but it does explain why this part of the night stayed vivid for you.\n\nHow did you feel around Priya: playful, comfortable, nervous, seen—or something else?',
        result: {
          mentionedEntities: [
            { id: 'sim-person-priya', name: 'Priya', type: 'character', loreKind: 'person' },
            { id: 'sim-person-leo', name: 'Leo', type: 'character', loreKind: 'person' },
            { id: 'sim-place-port-aurora', name: 'Port Aurora', type: 'location', loreKind: 'place' },
          ],
          connections: ['Relationship context · Priya', 'Introduced by Priya · Leo', 'Place context · Port Aurora'],
          timelineUpdates: ['👤 Priya marked as central to this event', '👤 Added Leo as a tentative new person'],
          creationOutcomes: [{ mention: 'Leo', action: 'defer', entityName: 'Leo', reason: 'New person held for confirmation before creating a durable profile.', authority: 'core' }],
          creationOutcomeSummary: 'Known entities merged; one new person awaits confirmation.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Northwind Arts Night', snippet: 'Harborlight Hall with Priya and Jordan' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'What will you remember about the night?', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'What stands out is not simply that you went to a party. You entered a loud, crowded space that could easily have overwhelmed you, yet you found a connection strong enough to make the night feel amazing. You spent hours with Priya, let yourself be social, and met someone new through her.\n\nThe part I would hold onto is this: the right company may change how you experience environments that normally drain you. That might be worth noticing again the next time you are deciding whether to go out.',
        result: {
          response_mode: 'RECALL',
          recall_sources: [{ entry_id: 'sim-party-entry', timestamp: new Date().toISOString(), summary: 'Northwind Arts Night at Harborlight Hall', emotions: ['excited', 'overwhelmed'], entities: ['Priya', 'Jordan', 'Leo', 'Harborlight Hall'] }],
          confidence_label: 'High confidence from this conversation',
          citations: [{ text: 'Northwind Arts Night at Harborlight Hall', sourceId: 'sim-party-entry', sourceType: 'entry' }],
          suggestedActions: [{ id: 'party-timeline', label: 'Open timeline', kind: 'navigate', surface: 'timeline' }],
        },
      },
      { type: 'updateThreadMeta', title: 'Northwind Arts Night', subtitle: 'Social life · emotions · memory', dominantEntities: ['Priya', 'Harborlight Hall', 'Leo'], touchActivity: true },
    ],
  },
  {
    id: 'romantic-interest',
    label: 'Romantic interest',
    description: 'Three turns: uncertainty-aware relationship tracking, patterns, boundaries, and guidance.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'userMessage', content: 'I think I might like Priya. At the party she kept finding reasons to stay near me, but I do not want to assume she feels the same.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'You seem to be doing two things at once: letting yourself feel excited and trying to protect both of you from a story that may not be true yet. That restraint is healthy, but be careful not to use “I don’t want to assume” as a reason to dismiss your own feelings entirely. You are allowed to like her before you know what she feels.\n\nWhat moments made you feel close to her—and which parts are you most afraid of misreading?',
        result: {
          mentionedEntities: [{ id: 'sim-person-priya', name: 'Priya', type: 'character', loreKind: 'person', characterVariant: 'romantic' }],
          connections: ['Romantic interest · Priya', 'Evidence context · Northwind Arts Night'],
          continuityWarnings: ['Priya’s feelings are not confirmed; observations remain separate from interpretation.'],
          timelineUpdates: ['💞 Noted your emerging feelings toward Priya', '📅 Connected this reflection to Northwind Arts Night'],
          creationOutcomes: [{ mention: 'Priya', action: 'merge', entityId: 'sim-person-priya', entityName: 'Priya', reason: 'Linked this reflection to Priya without asserting mutual romantic interest.', authority: 'core' }],
          creationOutcomeSummary: 'Relationship context updated while preserving uncertainty.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Northwind Arts Night', snippet: 'Danced with Priya and spent most of the night together' }],
          strategicGuidance: 'Let yourself acknowledge your attraction without turning ambiguous behavior into certainty.',
          modeDecision: { mode: 'SOCIAL_FOCUS', confidence: 0.93, reasoning: 'Relationship reflection with uncertainty preserved.' },
          suggestedActions: [{ id: 'romance-evidence', label: 'Describe the moments', kind: 'prefill', prompt: 'The moments that stood out were…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'She held my hand through the crowd and texted me afterward that she got home safe. I felt calm around her, not anxious like I usually do.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'Holding your hand through the crowd could have been practical, affectionate, or both; the text afterward shows care, but it still does not answer the romantic question by itself. The more revealing detail may be yours: you felt calm.\n\nIf attraction usually makes you anxious, calmness might feel less dramatic and therefore easier to overlook. But feeling safe enough to be present can be a stronger foundation than the familiar rush of uncertainty. What do you think was different with her?',
        result: {
          connections: ['Observed behavior · held hands', 'Observed behavior · follow-up text', 'Emotional pattern · calm versus anxious'],
          timelineUpdates: ['💞 Added a relationship moment with Priya', '🧭 Noted a change in your emotional pattern'],
          strategicGuidance: 'Stay curious and direct. A low-pressure invitation gives Priya room to answer without treating ambiguous signals as certainty.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Northwind Arts Night', snippet: 'Spent most of the night with Priya' }],
          suggestedActions: [{ id: 'romance-next', label: 'Plan a low-pressure invite', kind: 'prefill', prompt: 'Help me invite Priya to coffee without making it awkward.' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Help me decide what to do next without overthinking it.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'You do not need to solve her feelings before taking one honest, low-stakes step. Ask for something specific and easy to answer: “I had a really good time with you at the party. Want to grab coffee this week?”\n\nThat gives you real information instead of more clues to analyze. If she says yes, stay curious rather than treating it as proof of anything. If she is vague or declines, you will have protected your dignity by being clear without overexposing yourself. The goal is not to eliminate uncertainty—it is to respond to it with honesty.',
        result: {
          modeDecision: { mode: 'STRATEGIC', confidence: 0.96, reasoning: 'User requested concrete relationship guidance.' },
          strategicGuidance: 'Send one direct invitation, then let the response provide new evidence.',
          suggestedActions: [
            { id: 'romance-draft', label: 'Draft the text', kind: 'prefill', prompt: 'Draft a casual coffee invitation to Priya.' },
            { id: 'romance-fork', label: 'Explore my anxiety pattern', kind: 'fork', prompt: 'Why did feeling calm with Priya stand out to me?' },
          ],
        },
      },
      { type: 'updateThreadMeta', title: 'How I feel about Priya', subtitle: 'Romance · uncertainty · next step', dominantEntities: ['Priya', 'Northwind Arts Night'], touchActivity: true },
    ],
  },
  {
    id: 'conflict-repair',
    label: 'Conflict & repair',
    description: 'Three turns: competing perspectives, correction, boundaries, repair plan, and continuity.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'userMessage', content: 'Jordan got mad at me after the party because I disappeared with Priya. He said I always ditch my friends when I like someone.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'That accusation probably lands hard because there may be a real hurt underneath an unfair word like “always.” Jordan may genuinely have felt abandoned, while his version of your character is still not automatically true. You do not have to choose between taking his feelings seriously and defending yourself from a sweeping label.\n\nBefore deciding how to respond, what actually happened from your point of view—and had you two made a plan to stay together?',
        result: {
          mentionedEntities: [
            { id: 'sim-person-jordan', name: 'Jordan', type: 'character', loreKind: 'person' },
            { id: 'sim-person-priya', name: 'Priya', type: 'character', loreKind: 'person', characterVariant: 'romantic' },
          ],
          connections: ['Conflict · Jordan', 'Shared event · Northwind Arts Night', 'Context · Priya'],
          continuityWarnings: ['“Always ditches friends” is attributed to Jordan, not stored as established truth.'],
          timelineUpdates: ['⚡ Added a conflict follow-up connected to the party'],
          creationOutcomes: [{ mention: 'Jordan', action: 'merge', entityId: 'sim-person-jordan', entityName: 'Jordan', reason: 'Linked the conflict to the existing friendship without treating the accusation as fact.', authority: 'core' }],
          creationOutcomeSummary: 'Conflict context linked to Jordan with perspective boundaries.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Northwind Arts Night', snippet: 'Party with Priya and Jordan at Harborlight Hall' }],
          strategicGuidance: 'Separate Jordan’s valid feeling of being left behind from the global claim that you always abandon friends.',
          modeDecision: { mode: 'SUPPORTIVE', confidence: 0.94, reasoning: 'Conflict processing before advice.' },
          suggestedActions: [{ id: 'conflict-view', label: 'Tell my side', kind: 'prefill', prompt: 'From my point of view…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Actually, he was not mad that night. He texted me the next morning. I lost track of time and should have checked in.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'That changes the emotional picture. He did not confront you in the heat of the moment; he sat with it and contacted you the next morning. And you are already able to name your part without collapsing into self-blame: you lost track of time, and a check-in would have been considerate.\n\nThe useful distinction is between intention and impact. You may not have meant to ditch him, but he still experienced being left behind. Owning that specific impact is enough—you do not need to agree that it defines a permanent pattern.',
        result: {
          timelineUpdates: ['✏️ Corrected conflict timing to the next morning', '📅 Preserved party → follow-up sequence'],
          extractedDates: [{ date: 'next morning', context: 'Jordan raised the conflict by text' }],
          staleProjectionHints: [{ id: 'sim-party-summary', type: 'timeline_event', title: 'Party conflict timing', summary: 'Earlier summary may say the conflict happened at the party.' }],
          staleProjectionSummary: 'A prior derived summary needs refresh after your correction.',
          creationOutcomes: [{ mention: 'Jordan conflict timing', action: 'merge', entityId: 'sim-event-party-followup', entityName: 'Morning follow-up', reason: 'Corrected chronology merged into the existing event thread.', authority: 'core' }],
          creationOutcomeSummary: 'Correction applied without duplicating the event.',
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'I want to apologize without agreeing that I always ditch people. What should I say?', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'I would keep the apology focused on repair first and save the boundary for after he feels heard:\n\n“I’m sorry I disappeared and didn’t check in. I lost track of time, but I understand why it felt like I left you hanging. You matter to me, and next time I’ll tell you before I split off.”\n\nThen, if the conversation is calm: “I also want to talk about the word ‘always.’ I can own what happened that night, but I don’t want us to turn one conflict into a judgment about who I am.”\n\nSeparating those two parts matters. If you defend yourself inside the apology, he may only hear the defense. If you never address the label, resentment may linger for you.',
        result: {
          strategicGuidance: 'Acknowledge the concrete behavior, validate impact, name a future action, and set a boundary around the global accusation.',
          connections: ['Repair attempt · Jordan', 'Boundary · reject global label', 'Commitment · check in next time'],
          suggestedActions: [
            { id: 'conflict-copy', label: 'Make it sound like me', kind: 'prefill', prompt: 'Rewrite that apology in a more casual tone.' },
            { id: 'conflict-fork', label: 'Explore the friendship pattern', kind: 'fork', prompt: 'Has this tension with Jordan happened before?' },
          ],
        },
      },
      { type: 'updateThreadMeta', title: 'Repairing things with Jordan', subtitle: 'Conflict · accountability · boundaries', dominantEntities: ['Jordan', 'Priya', 'Northwind Arts Night'], touchActivity: true },
    ],
  },
  {
    id: 'marriage-family',
    label: 'Marriage & family',
    description: 'Three turns: marriage, a step-son, a new baby, and the blended family tree coming together.',
    steps: [
      { type: 'createThread', select: true },
      {
        type: 'userMessage',
        content: 'Been meaning to tell you — Jamie and I got married in the spring. She has a son, Eli, from her first marriage, and honestly he is basically mine too at this point.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'Congratulations — that is a big thing to fold into your story quietly like that. Marrying Jamie is one update, but the way you talk about Eli is its own thing: “basically mine” is not the same as “my stepson,” and it sounds like you have earned that closeness rather than inherited it by paperwork.\n\nHow involved is Eli’s dad these days, and how has Eli been taking on a second parent in the house?',
        result: {
          mentionedEntities: [
            { id: 'sim-person-jamie', name: 'Jamie', type: 'character', characterVariant: 'romantic', loreKind: 'person' },
            { id: 'sim-person-eli', name: 'Eli', type: 'character', loreKind: 'person' },
          ],
          connections: ['Marriage · Jamie', 'Step-son · Eli'],
          continuityWarnings: ['"Basically mine" describes the bond you feel with Eli, not a formal legal status — stored as a step-parent relationship, not an adoption.'],
          timelineUpdates: ['💍 Marked Jamie as your wife', '👨‍👦 Linked Eli as your step-son'],
          creationOutcomes: [
            { mention: 'Jamie', action: 'merge', entityId: 'sim-person-jamie', entityName: 'Jamie', reason: 'Relationship type updated from dating to wife.', authority: 'core' },
            { mention: 'Eli', action: 'create', entityId: 'sim-person-eli', entityName: 'Eli', reason: 'New step-son linked through the marriage to Jamie.', authority: 'core' },
          ],
          creationOutcomeSummary: 'Marriage recorded and Eli linked as a step-son on your family tree.',
          sources: [{ type: 'entry', id: 'sim-marriage-entry', title: 'Marrying Jamie', snippet: 'Married Jamie in the spring; her son Eli is basically mine too' }],
          suggestedActions: [{ id: 'family-eli', label: 'Tell me about Eli', kind: 'prefill', prompt: 'Eli is…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      {
        type: 'userMessage',
        content: 'Eli’s dad, Jordan Ellis, is still very involved — they co-parent well, no drama. And Jamie and I actually just had a baby of our own four months ago. Her name is Mia.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'That is a full household now — Mia as your daughter with Jamie, Eli as your step-son, and Jordan still steadily present as Eli’s other parent. Blended families get messy when a co-parent is combative, but it sounds like Jordan is not the obstacle here, which makes this a lot more sustainable.\n\nI will keep Mia and Eli on the same family tree but flag which parent pair each of them actually comes from, so it stays accurate as the family grows.',
        result: {
          mentionedEntities: [
            { id: 'sim-person-mia', name: 'Mia', type: 'character', loreKind: 'person' },
            { id: 'sim-person-jordan-ellis', name: 'Jordan Ellis', type: 'character', loreKind: 'person' },
          ],
          connections: ['Offspring · Mia (you and Jamie)', 'Co-parent · Jordan Ellis (Eli’s father)'],
          timelineUpdates: ['👶 Added Mia as your daughter with Jamie', '🤝 Linked Jordan Ellis as Eli’s co-parent'],
          creationOutcomes: [
            { mention: 'Mia', action: 'create', entityId: 'sim-person-mia', entityName: 'Mia', reason: 'Shared child of you and Jamie.', authority: 'core' },
            { mention: 'Jordan Ellis', action: 'create', entityId: 'sim-person-jordan-ellis', entityName: 'Jordan Ellis', reason: 'Eli’s other parent, co-parenting with Jamie.', authority: 'core' },
          ],
          creationOutcomeSummary: 'Mia and Jordan Ellis added — the family tree now distinguishes offspring from step-family.',
          strategicGuidance: 'Keep celebrating what is working with Jordan; a low-conflict co-parent is not something to take for granted.',
          sources: [{ type: 'entry', id: 'sim-marriage-entry', title: 'Marrying Jamie', snippet: 'Jamie and I had Mia; Eli’s dad Jordan still co-parents well' }],
          suggestedActions: [{ id: 'family-kids-together', label: 'Open Kids Together', kind: 'navigate', surface: 'family' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'What does my family actually look like now, all together?', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'Here is the shape of it: you married Jamie this spring. Together you have Mia, four months old. Jamie also has Eli from her first marriage — he is your step-son, and his dad Jordan Ellis stays actively involved and easy to work with. That is one household holding two kids with different parent pairings, and by your own account it is working.',
        result: {
          response_mode: 'RECALL',
          recall_sources: [{ entry_id: 'sim-marriage-entry', timestamp: new Date().toISOString(), summary: 'Married Jamie; Mia born four months ago; Eli is a step-son co-parented with Jordan Ellis', emotions: ['settled', 'proud'], entities: ['Jamie', 'Mia', 'Eli', 'Jordan Ellis'] }],
          confidence_label: 'High confidence from this conversation',
          citations: [{ text: 'Married Jamie; Mia born four months ago', sourceId: 'sim-marriage-entry', sourceType: 'entry' }],
          suggestedActions: [{ id: 'family-tree-open', label: 'View Family Tree', kind: 'navigate', surface: 'family' }],
        },
      },
      { type: 'updateThreadMeta', title: 'Building our blended family', subtitle: 'Marriage · kids together · family tree', dominantEntities: ['Jamie', 'Mia', 'Eli'], touchActivity: true },
    ],
  },
  {
    id: 'co-parenting',
    label: 'Co-parenting',
    description: 'Two turns: a non-romantic co-parent relationship, shared custody, and correcting a stale "ex" label.',
    steps: [
      { type: 'createThread', select: true },
      {
        type: 'userMessage',
        content: 'Quick correction — Priya and I are not together anymore, but we are solid co-parents for Noah now. Can you stop labeling her as my ex? That is not really what it is anymore.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'Fair correction — “ex” centers the breakup, but what you are describing is a working partnership built around Noah, which is a different thing entirely. I will update Priya to co-parent instead. The romantic history does not disappear, it just stops being the label that defines how she shows up in your life now.\n\nHow long has the co-parenting rhythm with Priya actually been running smoothly like this?',
        result: {
          mentionedEntities: [
            { id: 'sim-person-priya', name: 'Priya', type: 'character', loreKind: 'person' },
            { id: 'sim-person-noah', name: 'Noah', type: 'character', loreKind: 'person' },
          ],
          connections: ['Co-parent · Priya', 'Shared child · Noah'],
          timelineUpdates: ['🔁 Updated Priya from ex-partner to co-parent', '👶 Noah linked as your shared child'],
          creationOutcomes: [{ mention: 'Priya', action: 'merge', entityId: 'sim-person-priya', entityName: 'Priya', reason: 'Relationship type corrected from romantic-ex to co-parent at the user’s request.', authority: 'core' }],
          creationOutcomeSummary: 'Priya’s relationship type corrected to co-parent; Noah linked as the shared child.',
          continuityWarnings: ['Past romantic history with Priya is preserved, but the current relationship label reflects co-parenting, not an active or past romance.'],
          sources: [{ type: 'entry', id: 'sim-coparent-entry', title: 'Co-parenting with Priya', snippet: 'Priya and I are co-parents for Noah now, not exes' }],
          suggestedActions: [{ id: 'coparent-rhythm', label: 'Describe the custody schedule', kind: 'prefill', prompt: 'The schedule we settled on is…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      {
        type: 'userMessage',
        content: 'About two months now. We alternate weeks — Noah is with me Monday through Thursday, with Priya Friday through Sunday. No fighting over the calendar anymore.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'Two months of a Mon–Thu / Fri–Sun split with no calendar fights is worth noting — that is usually the hardest part to stabilize after a split. I will log this as the current custody rhythm so it is easy to reference later if it ever needs adjusting, rather than something you have to re-explain from scratch.',
        result: {
          timelineUpdates: ['📅 Logged the weekly custody rhythm with Priya'],
          strategicGuidance: 'A calm, predictable schedule like this is worth protecting — flag it early if either side starts drifting from it.',
          sources: [{ type: 'entry', id: 'sim-coparent-entry', title: 'Co-parenting with Priya', snippet: 'Mon–Thu with me, Fri–Sun with Priya, two months running' }],
          suggestedActions: [{ id: 'coparent-open', label: 'Open Kids Together', kind: 'navigate', surface: 'family' }],
        },
      },
      { type: 'updateThreadMeta', title: 'Co-parenting with Priya', subtitle: 'Co-parent · custody rhythm', dominantEntities: ['Priya', 'Noah'], touchActivity: true },
    ],
  },
  {
    id: 'life-log-milestone',
    label: 'Life Log milestone',
    description: 'Two turns: a graduation gets captured as a high-significance Life Log milestone with the people who were there.',
    steps: [
      { type: 'createThread', select: true },
      {
        type: 'userMessage',
        content: 'Huge day — I walked at graduation this weekend. Mom, Dad, and my sister Zoe all flew out for it. Four years, finally done.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'Four years compresses into about ninety seconds of walking across a stage, and somehow that is still the part that makes it feel real. Having Mom, Dad, and Zoe all fly out means this was not a quiet milestone — people rearranged their lives to be there for it.\n\nWhat is the part you keep replaying — the walk itself, or something that happened with your family that day?',
        result: {
          mentionedEntities: [
            { id: 'sim-event-graduation', name: 'Graduation', type: 'event', loreKind: 'event' },
            { id: 'sim-person-mom', name: 'Mom', type: 'character', loreKind: 'person' },
            { id: 'sim-person-dad', name: 'Dad', type: 'character', loreKind: 'person' },
            { id: 'sim-person-zoe', name: 'Zoe', type: 'character', loreKind: 'person' },
          ],
          connections: ['Milestone · Graduation', 'Family · Mom, Dad, and Zoe'],
          continuityWarnings: ['Significance level is an estimate from this conversation — it can shift if more context about the day comes up later.'],
          timelineUpdates: ['🎓 Logged Graduation as a Life Log milestone', '👪 Linked Mom, Dad, and Zoe as attendees'],
          creationOutcomes: [{ mention: 'Graduation', action: 'create', entityId: 'sim-event-graduation', entityName: 'Graduation', authority: 'core' }],
          creationOutcomeSummary: 'Graduation logged as a milestone event with your family linked as attendees.',
          sources: [{ type: 'entry', id: 'sim-graduation-entry', title: 'Graduation weekend', snippet: 'Walked at graduation with Mom, Dad, and Zoe there' }],
          suggestedActions: [{ id: 'grad-reflect', label: 'How it felt', kind: 'prefill', prompt: 'Walking across that stage felt…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Honestly it did not feel real until I saw Dad crying in the crowd. That is when it actually hit me.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'That is a good detail to hold onto — the ceremony itself can feel scripted, but Dad crying was not scripted. Sometimes the milestone only becomes real once you see it land on someone else. I am marking this as a high-significance entry in your Life Log so it surfaces alongside your other major life events, not buried under routine days.',
        result: {
          timelineUpdates: ['📈 Marked Graduation as high-significance in your Life Log'],
          strategicGuidance: 'Moments like this are worth writing down while they are still vivid — the specific detail (Dad crying) is what makes it retrievable later, not the general fact of graduating.',
          sources: [{ type: 'entry', id: 'sim-graduation-entry', title: 'Graduation weekend', snippet: 'Dad crying in the crowd is what made it feel real' }],
          suggestedActions: [{ id: 'grad-lifelog', label: 'Open Life Log', kind: 'navigate', surface: 'timeline' }],
        },
      },
      { type: 'updateThreadMeta', title: 'Graduation day', subtitle: 'Milestone · family · Life Log', dominantEntities: ['Mom', 'Dad', 'Zoe'], touchActivity: true },
    ],
  },
  {
    id: 'live-reply',
    label: 'Live reply',
    description: 'New thread, user message, staged loading, streaming assistant reply.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 400 },
      {
        type: 'userMessage',
        content: 'Professor Smith helped me debug my ROS 2 launch file today — Omega-1 finally moves in Gazebo.',
        touchActivity: true,
      },
      { type: 'wait', ms: 500 },
      {
        type: 'assistantStream',
        content:
          'That is a real milestone. Launch files and Gazebo sim are where robotics projects stop being abstract — Omega-1 moving means your CSUF lab work is compounding.\n\nI would link **Professor Smith**, **ROS 2**, and **Omega-1** on your timeline. Want to capture what finally clicked?',
      },
      {
        type: 'updateThreadMeta',
        title: 'ROS 2 launch breakthrough',
        subtitle: 'Robotics · mentor',
        dominantEntities: ['Professor Smith', 'ROS 2', 'Omega-1'],
        touchActivity: true,
      },
    ],
  },
  {
    id: 'thread-bump',
    label: 'Thread bump',
    description: 'Reactivate an older thread — sidebar reorder + message enter animations.',
    steps: [
      { type: 'selectThread', threadId: 'second' },
      { type: 'wait', ms: 600 },
      {
        type: 'userMessage',
        content: 'Picking this back up — Alex and I are planning another Mission Beach weekend.',
        touchActivity: true,
      },
      { type: 'wait', ms: 450 },
      {
        type: 'assistantStream',
        content:
          'Good thread to revive. Mission Beach keeps showing up as a reset place for you and Alex — worth noting as a recurring pattern.',
        chunkSize: 10,
        chunkDelayMs: 28,
      },
    ],
  },
  {
    id: 'multi-turn',
    label: 'Multi-turn',
    description: 'Two conversational turns with pauses — tests sequential message enters.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 350 },
      { type: 'userMessage', content: 'Had coffee with Marcus — he might know someone at Vanguard Robotics.', touchActivity: true },
      { type: 'wait', ms: 700 },
      {
        type: 'assistantStream',
        content: 'Marcus keeps surfacing as a connector in your network. I would log this as a career lead thread.',
      },
      { type: 'wait', ms: 900 },
      { type: 'userMessage', content: 'Yeah — I want my robotics skills linked if I follow up.', touchActivity: true },
      { type: 'wait', ms: 600 },
      {
        type: 'assistantStream',
        content: 'Done — your skill profile and this thread can stay linked so interview prep stays in one place.',
      },
      {
        type: 'updateThreadMeta',
        title: 'Vanguard Robotics lead',
        subtitle: 'Career · network',
        dominantEntities: ['Marcus', 'Vanguard Robotics'],
      },
    ],
  },
  {
    id: 'composer-send',
    label: 'Composer send',
    description: 'Uses the full sendMessage path (same as typing + Enter in production).',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 300 },
      { type: 'sendViaComposer', content: 'Log this: Jordan and I ran Golden Gate Park again — felt like our usual Sunday ritual.' },
    ],
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveThreadId(
  adapter: ChatLifecycleAdapter,
  ref: ChatLifecycleStep & { type: 'selectThread' | 'navigate' },
  activeThreadId: string | null
): string | null {
  if (ref.threadId === 'active') return activeThreadId;
  if (ref.threadId === 'first') return adapter.getThreads()[0]?.id ?? null;
  if (ref.threadId === 'second') return adapter.getThreads()[1]?.id ?? null;
  return ref.threadId;
}

async function runLoadingStages(adapter: ChatLifecycleAdapter): Promise<void> {
  for (const step of STAGE_SEQUENCE) {
    adapter.onLoadingStage?.(step.stage, step.progress);
    await sleep(step.ms);
  }
  adapter.onLoadingStage?.('generating', 100);
}

async function streamAssistantReply(
  adapter: ChatLifecycleAdapter,
  threadId: string,
  content: string,
  chunkSize = 12,
  chunkDelayMs = 42,
  result?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'timestamp' | 'isStreaming'>>
): Promise<void> {
  const assistantId = `sim-assistant-${Date.now()}`;
  adapter.appendMessage(threadId, {
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isStreaming: true,
    persistStatus: 'pending',
    activePersona: 'LoreBook',
    ragStats: {
      sourceCount: 3,
      cacheHit: false,
      retrievalMs: 220,
      contextItems: 5,
    },
    modeDecision: {
      mode: 'story_context',
      confidence: 0.82,
      reasoning: 'Demo mode is simulating source lookup, context connection, and response drafting.',
    },
    metadata: {
      intent: 'story_context',
      why: 'Demo mode is showing the composing flow with a visible reasoning summary.',
    },
    ...result,
  });

  await runLoadingStages(adapter);

  let accumulated = '';
  await streamDemoFocusReply(
    content,
    (chunk) => {
      accumulated += chunk;
      adapter.updateMessage(threadId, assistantId, { content: accumulated, isStreaming: true });
    },
    { chunkSize, delayMs: chunkDelayMs }
  );

  adapter.updateMessage(
    threadId,
    assistantId,
    { ...result, content: accumulated, isStreaming: false, persistStatus: 'saved' },
    { touchActivity: true }
  );
}

export async function runChatLifecycleScenario(
  adapter: ChatLifecycleAdapter,
  scenario: ChatLifecycleScenario,
  options?: { signal?: AbortSignal; onStep?: (index: number, step: ChatLifecycleStep) => void }
): Promise<void> {
  let activeThreadId = adapter.getActiveThreadId();

  for (let i = 0; i < scenario.steps.length; i++) {
    if (options?.signal?.aborted) return;
    const step = scenario.steps[i];
    options?.onStep?.(i, step);

    switch (step.type) {
      case 'wait':
        await sleep(step.ms);
        break;

      case 'createThread': {
        activeThreadId = adapter.createThread();
        if (step.select !== false) {
          adapter.selectThread(activeThreadId);
          adapter.navigateToThread(activeThreadId);
        }
        break;
      }

      case 'selectThread': {
        const id = resolveThreadId(adapter, step, activeThreadId);
        if (!id) break;
        activeThreadId = id;
        adapter.selectThread(id);
        break;
      }

      case 'navigate': {
        const id = resolveThreadId(adapter, step, activeThreadId);
        if (!id) break;
        activeThreadId = id;
        adapter.navigateToThread(id);
        break;
      }

      case 'userMessage': {
        if (!activeThreadId) {
          activeThreadId = adapter.createThread();
          adapter.selectThread(activeThreadId);
          adapter.navigateToThread(activeThreadId);
        }
        const userId = `sim-user-${Date.now()}`;
        adapter.appendMessage(
          activeThreadId,
          {
            id: userId,
            role: 'user',
            content: step.content,
            timestamp: new Date(),
            persistStatus: 'pending',
          },
          { touchActivity: step.touchActivity !== false }
        );
        const thread = adapter.getThreads().find((t) => t.id === activeThreadId);
        if (thread && thread.messages.filter((m) => m.role === 'user').length === 1) {
          adapter.updateThread(activeThreadId, {
            title: deriveTitleFromFirstUserMessage(step.content) || deriveDemoThreadTitle(step.content),
            touchActivity: step.touchActivity !== false,
          });
        }
        break;
      }

      case 'assistantStream': {
        if (!activeThreadId) break;
        await streamAssistantReply(
          adapter,
          activeThreadId,
          step.content,
          step.chunkSize,
          step.chunkDelayMs,
          step.result
        );
        break;
      }

      case 'updateThreadMeta':
        if (!activeThreadId) break;
        adapter.updateThread(activeThreadId, {
          title: step.title,
          subtitle: step.subtitle,
          dominantEntities: step.dominantEntities,
          touchActivity: step.touchActivity,
        });
        break;

      case 'sendViaComposer': {
        if (!adapter.sendMessage) {
          const demo = buildDemoChatResponse(step.content);
          if (!activeThreadId) {
            activeThreadId = adapter.createThread();
            adapter.selectThread(activeThreadId);
            adapter.navigateToThread(activeThreadId);
          }
          adapter.appendMessage(
            activeThreadId,
            { id: `sim-user-${Date.now()}`, role: 'user', content: step.content, timestamp: new Date() },
            { touchActivity: true }
          );
          await streamAssistantReply(adapter, activeThreadId, demo.content);
          break;
        }
        await adapter.sendMessage(step.content);
        activeThreadId = adapter.getActiveThreadId();
        break;
      }

      default:
        break;
    }
  }
}

export function getChatLifecycleScenario(id: string): ChatLifecycleScenario | undefined {
  return CHAT_LIFECYCLE_SCENARIOS.find((s) => s.id === id);
}
