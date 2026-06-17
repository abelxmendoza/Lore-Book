/**
 * Demo Mode lorebook mock data — fictional multipage books for the library reader.
 *
 * Four interconnected stories set in Marrowvale, a coastal archipelago where
 * lighthouses guard seals on forgotten doors beneath the sea.
 */

export type DemoMemoirSection = {
  id: string;
  title: string;
  content: string;
  order: number;
  parentId?: string;
  children?: DemoMemoirSection[];
  focus?: string;
  period?: { from: string; to: string };
  lastUpdated?: string;
};

export type DemoMemoirOutline = {
  id: string;
  title: string;
  sections: DemoMemoirSection[];
  lastUpdated: string;
  autoUpdate: boolean;
  metadata?: {
    languageStyle?: string;
    originalDocument?: boolean;
  };
};

export type DemoLoreChapter = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  summary?: string | null;
};

export type DemoLorebookCatalogEntry = {
  id: string;
  title: string;
  scope: string;
  period: string;
  chapters: number;
  pages: number;
  gradient: string;
  accent: string;
  border: string;
  lastRead: string;
};

export type DemoLorebook = DemoLorebookCatalogEntry & {
  outline: DemoMemoirOutline;
  loreChapters: DemoLoreChapter[];
};

function prose(...paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

function section(
  id: string,
  title: string,
  content: string,
  order: number,
  period: { from: string; to: string },
  focus: string
): DemoMemoirSection {
  return { id, title, content, order, period, focus };
}

// ─── Book 1: The Keeper of Marrowvale ───────────────────────────────────────

const keeperSections: DemoMemoirSection[] = [
  section(
    'keeper-1',
    'Salt on the Tongue',
    prose(
      `Elias Thornwick was born during a storm so violent the midwife swore the house rocked like a skiff. His mother said the first sound he made was not a cry but a hum — low and steady, as if he had already learned the rhythm of the beacon above their cottage. Marrowvale was a string of black cliffs and narrow harbors where fishermen spoke to the tide as though it were a relative with moods, and Elias grew up believing the world was held together by light kept burning through the dark.`,
      `His father tended the North Point lamp until the night the fog swallowed him whole. Elias was twelve when they found the skiff overturned on the shale, oar snapped, lamp oil staining the water like ink. The village held a quiet funeral and then looked to the boy as though he might inherit more than grief. The lighthouse board sent a letter written in cramped script: the Thornwick line had always kept the seal. Elias did not know what that meant. He only knew the beam had to turn, and someone had to climb the spiral stairs.`,
      `He learned the lamp the way other children learned songs — by repetition until the body remembered. Trim the wick. Check the reservoir. Listen for the groan of the mechanism when the wind pushed against the lens. On clear nights the beam swept the channel and ships passed in safety. On foul nights Elias stood in the lantern room and felt the tower breathe around him, stone expanding and contracting with heat and cold.`,
      `The old keeper's journal waited in a drawer he was not supposed to open. He opened it anyway on his seventeenth birthday, hands shaking with a mixture of guilt and hunger. The pages described doors beneath the water, hinges of coral and iron, and a hum that answered the lighthouse when the moon was thin. "The seal is not a metaphor," his father had written. "The light is a lock. Do not let it fail." Elias read until dawn grayed the horizon, and when he finally slept he dreamed of a corridor opening under the waves.`,
      `He woke to the lamp sputtering — the first failure in three generations. Oil line clogged, wick charred wrong. He fixed it with frantic hands and the beam steadied, but the dream lingered. That afternoon he walked the cliff path and saw something impossible: a ring of calm water in the churn, perfectly round, as if a great eye had opened in the sea. The hum returned, faint through wind, resonating in his teeth. Elias Thornwick understood, with the slow certainty of tide coming in, that his life would not be a simple story of tending flame.`
    ),
    1,
    { from: '1891-03-14', to: '1908-11-02' },
    'Childhood and inheritance of the lighthouse'
  ),
  section(
    'keeper-2',
    'The Spiral and the Seal',
    prose(
      `The lighthouse was older than Marrowvale's church and less forgiving. Elias mapped its interior over years — not rooms, but pressures. The cellar door that stuck in winter. The third landing where voices carried upward even when no one spoke below. The lantern room where time seemed to stretch between each rotation of the beam. He kept his father's journal close and added his own observations in margins growing wider as certainty narrowed.`,
      `On equinox nights the mechanism required manual correction. Elias climbed with a brass key worn smooth by generations of palms. The gears engaged with a click that sounded like a bone settling into place. When the beam aligned true north, the hum rose from somewhere deep — not through the air but through the stone, a vibration that made his fillings ache. He recorded each occurrence: date, moon phase, wind direction, duration. Patterns emerged. The seal responded to attention.`,
      `Villagers brought him fish and gossip but rarely questions. They called him Keeper as though it were a name. Children dared each other to touch the lighthouse door at midnight; Elias pretended not to hear their laughter. He knew what lived in the space between legend and maintenance. Once, repairing a cracked lens, he saw his reflection lag a half-second behind his movements. He blamed fatigue. He did not blame fatigue the second time.`,
      `Mira Solenne returned to Marrowvale that spring — childhood friend, now cartographer for the Meridian Survey. She found him on the rocks with tide charts and ink-stained fingers. "You look like a man guarding a secret," she said. He said, "I look like a man guarding a lamp." They both knew it was the same thing. She asked to see the journal. He refused. She asked to see the cellar. He refused harder.`,
      `She left a folded map on his kitchen table anyway — coastlines drawn with impossible precision, harbors that did not exist on any Admiralty chart. In the margin she had written: You are not keeping ships safe. You are keeping something in. Elias burned the map in the lamp room, watched edges curl black, then swept the ash into the sea. That night the hum lasted until morning. He added a new entry to the journal: The seal knows when we speak its name.`
    ),
    2,
    { from: '1909-04-01', to: '1912-09-30' },
    'Discovering the lighthouse as a lock'
  ),
  section(
    'keeper-3',
    'Letters from the Deep',
    prose(
      `The first bottle arrived on a morning without wind. Glass green as kelp, cork sealed with wax the color of dried blood. Inside, a single sheet waterlogged but legible: THANK YOU FOR THE LIGHT. Elias thought it a prank until the second bottle came, then the third. Messages in languages he did not recognize, and one in plain Meridian script: We remember the Thornwick line. We wait in the hinge.`,
      `He consulted the parish records, the harbor master's logs, even the midwife's memory. Nothing explained correspondence from the sea. Mira, when he finally showed her a bottle, went very still. "These coordinates," she said, tracing salt-stiff paper. "They're not on the surface." She meant they described geography beneath the waves — tunnels, chambers, a vault aligned with the lighthouse foundation.`,
      `Together they descended at low tide into a cave only visible when the moon was new. Barnacles cut their boots. Bioluminescence painted the walls in soft green. At the back of the cave, a door — not metaphor, not myth — stood half-open in the rock. Iron bands. Coral growth like filigree. Warm air breathed from the crack, carrying the smell of ozone and old paper.`,
      `Elias raised his lantern. The hum became a chord. From beyond the door came a sound like distant applause — or like many hands pressed against wood from the other side. Mira gripped his arm. "If you close it," she whispered, "you close it knowing what's inside." He thought of his father, of ships in fog, of the village sleeping uphill. He pulled the door shut. The iron sang. The lighthouse beam flared once, brilliant as noon, and every bottle on the shore shattered simultaneously.`,
      `Afterward they did not speak for three days. On the fourth, Elias wrote in the journal: I have met the hinge. It knows my name. Mira added her own line beneath: And mine. The seal holds for now.`
    ),
    3,
    { from: '1912-10-01', to: '1913-06-15' },
    'First contact with the sealed realm'
  ),
  section(
    'keeper-4',
    'The Council of Harbors',
    prose(
      `News of shattered bottles traveled faster than Elias expected. The Meridian Survey sent officials. The Lighthouse Board sent inspectors. A woman in a gray coat arrived last, introducing herself only as Vance from the Council of Harbors — an organization Elias had never heard of, which was evidently the point.`,
      `"Every lighthouse on the Meridian is a lock," Vance said over tea he did not offer. "Most keepers never learn. Your line is different. The seal at Marrowvale is primary. If it fails, the chain fails." She spread charts across his table — lighthouses as pins, lines of force connecting them undersea. Mira verified the geometry with a nod Elias found infuriating and reassuring in equal measure.`,
      `Vance wanted access. Elias wanted solitude. They compromised with protocols: inspections on solstice only, no instruments left behind, Mira present as witness. The first inspection revealed hairline fractures in the cellar stone — not structural failure, Vance said, but stress from the other side. "Something pushes," she admitted. "Not always. Not yet."`,
      `Rumors reached the village. Fishermen reported catches with scales that reflected lamplight. A boy swore he heard singing from the cliff cave. Elias addressed the harbor at dusk, choosing words carefully. "The lamp will hold," he said. "Mind your nets and the tide." He did not say: mind your dreams. He did not say: if the beam falters, run.`,
      `That night he and Mira reinforced the door with iron bands salvaged from his father's skiff. The hum softened, as if satisfied. Vance left a card: When you are ready to learn what the hinge guards, call. Elias tucked it into the journal and did not call. Not yet.`
    ),
    4,
    { from: '1913-06-16', to: '1914-12-31' },
    'Political pressure and the wider network of seals'
  ),
  section(
    'keeper-5',
    'What the Light Remembers',
    prose(
      `Winter brought storms that tested every rivet. Elias slept in the lantern room, waking every ninety minutes to verify rotation. Fatigue blurred days. In the blur he began to remember things he had never lived — his grandfather's hands on the same rail, his great-grandmother's voice teaching the wick song. The lighthouse was a memory device. The keepers were its living keys.`,
      `On the longest night, the door in the cave opened without touch. Not wide — a finger's width. Light from beneath was not reflection but emission, pale and patient. Elias did not enter. He sat before the crack and asked the hinge a question he had carried since childhood: What are you keeping from the world? The answer was not words. It was images: cities of glass under pressure, creatures of geometry, libraries where books wrote themselves. A civilization that had bargained with the sea to survive.`,
      `They had built the seals themselves, long before Marrowvale had a name. Thornwicks were not chosen by blood accident but by attunement — a frequency passed parent to child. Elias felt it now, a tuning fork struck in his chest. The seal did not need fear. It needed attention. Neglect was the true enemy.`,
      `He closed the door with both palms and the hum resolved into a single clear note. Mira found him afterward shaking with exhaustion and something like joy. "We can teach the village," she said. "Not everything. Enough." He nodded. Enough was the covenant keepers made — enough light, enough vigilance, enough silence.`,
      `Years later, when visitors asked Elias Thornwick what he had guarded, he said simply: "The tide's patience." If they pressed, he offered tea and a view of the beam sweeping the channel. Some secrets were kept by being lived, not told. The lighthouse turned. The sea held its breath. Marrowvale slept, unaware and safe, which was the only gift he knew how to give.`
    ),
    5,
    { from: '1915-01-01', to: '1924-08-19' },
    'Mastery of the keeper\'s covenant'
  ),
];

const keeperChapters: DemoLoreChapter[] = [
  {
    id: 'keeper-ch-1',
    title: 'Inheritance',
    start_date: '1891-03-14',
    end_date: '1908-11-02',
    description: 'Birth, loss, and the first climb to the lantern room',
    summary: 'Elias inherits the Thornwick duty and discovers his father\'s journal.',
  },
  {
    id: 'keeper-ch-2',
    title: 'The Lock',
    start_date: '1909-04-01',
    end_date: '1912-09-30',
    description: 'Mapping the lighthouse and reuniting with Mira',
    summary: 'The seal reveals itself through hum, reflection, and forbidden charts.',
  },
  {
    id: 'keeper-ch-3',
    title: 'The Hinge',
    start_date: '1912-10-01',
    end_date: '1913-06-15',
    description: 'Messages from beneath and the cave door',
    summary: 'Bottles, coordinates, and the first deliberate closing of the hinge.',
  },
  {
    id: 'keeper-ch-4',
    title: 'Council',
    start_date: '1913-06-16',
    end_date: '1914-12-31',
    description: 'The wider world learns Marrowvale is not ordinary',
    summary: 'Vance and the Council of Harbors explain the network of seals.',
  },
  {
    id: 'keeper-ch-5',
    title: 'Covenant',
    start_date: '1915-01-01',
    end_date: '1924-08-19',
    description: 'What the light remembers and what it guards',
    summary: 'Elias accepts the attunement and the quiet work of keeping.',
  },
];

// ─── Book 2: Mira Solenne ─────────────────────────────────────────────────────

const miraSections: DemoMemoirSection[] = [
  section(
    'mira-1',
    'Two Children on the Jetty',
    prose(
      `Mira Solenne met Elias Thornwick on the jetty when they were both seven, because the jetty was the only place adults let them go unattended and because Elias was already studying the water as though it owed him an explanation. Mira had stolen her brother's compass and was testing whether north changed when you spun in circles. Elias said north was honest and people were the ones who spun.`,
      `They became friends the way coastal children do — shared secrets, shared bruises, shared punishment for being somewhere they should not. They explored tide pools and named the crabs after harbor officials. Elias named his Crab Vance before either of them knew what the name would come to mean. Mira drew maps of their discoveries in a notebook with a cracked spine.`,
      `When Elias's father died, Mira did not offer empty comfort. She sat with Elias on the rocks and said, "The lamp will need you now." He said, "I know." She said, "I'll help." She meant it in the only way that mattered: she would not pretend the loss was smaller than it was.`,
      `Her family moved inland when she was fifteen — father's work, mother's health, the ordinary catastrophes that pull childhood apart. They wrote letters for a year, then two, then silence that was not cruelty but drift. Mira learned cartography at the Meridian Survey College. Elias learned the weight of stairs. Both learned distance.`,
      `She carried a copy of their last map — the jetty, the cave mouth, an X marked in charcoal — through every training exercise. Instructors praised her precision. She never said the X was where her friend listened to the sea hum. Some coordinates are emotional before they are geographic.`
    ),
    1,
    { from: '1898-06-01', to: '1913-03-31' },
    'Childhood friendship and separation'
  ),
  section(
    'mira-2',
    'The Survey Takes Her Back',
    prose(
      `The Meridian Survey assigned Mira to the Marrowvale coast because her file noted "prior local knowledge." She did not tell her supervisor that knowledge included the keeper's laugh and the taste of rockweed. She returned on a ferry that smelled of diesel and herring and saw the lighthouse beam cutting fog exactly as she remembered — steady, arrogant, faithful.`,
      `Elias looked older than twenty-two. Grief had polished him. They met officially on harbor steps, survey case in her hand, journal visible in his pocket. "Cartographer Solenne," he said. "Keeper Thornwick," she replied. Formality lasted exactly until she asked if he still named crabs. He smiled like a door unlocking.`,
      `She camped in the village inn. He climbed the tower. During the day she measured and sketched. At dusk they walked the cliff path, careful with words, careless with silence. She told him about cities of ink and lecture halls. He told her about bottles and a door. She was not surprised. She had always suspected the cave was more than a dare.`,
      `Her first report to the Survey described Marrowvale as "geologically anomalous, socially stable, cartographically reluctant." Her supervisor underlined reluctant and wrote Come back with numbers. Mira added numbers that were true and omitted ones that were truer. Loyalty, she was learning, was a form of projection — choosing what to show on a flat surface.`,
      `When she presented Elias with the impossible map, she knew he might burn it. She also knew he needed to see that someone else had drawn the hinge in ink. Friendship, at its best, is the courage to show another person their own fear rendered beautifully.`
    ),
    2,
    { from: '1913-04-01', to: '1913-08-31' },
    'Return to Marrowvale as cartographer'
  ),
  section(
    'mira-3',
    'Mapping What Moves',
    prose(
      `Cartography taught Mira that coastlines lie. Not from malice — from motion. Sands shift. Cliffs calve. Harbors silt. A map is a argument about stability. Marrowvale's argument was losing. Her instruments recorded drift that should not occur in granite. Elias recorded hum duration. They overlaid datasets by lamplight and saw the seal's influence like a tide chart drawn in another medium.`,
      `"You're mapping a lock," Elias said. "I'm mapping a relationship," she corrected. The lock moved when attended. Neglect made it restless. Attention calmed it. She had never heard of geography that responded to care. Yet her hand steadied when she drew with Elias in the room.`,
      `They developed a code — lighthouse signals for survey emergencies, survey flags for lamp trouble. The village thought them eccentric. Vance, when she arrived, thought them effective. Mira refused Council employment but accepted Council libraries, reading about other sealed places: deserts with buried doors, mountains with hollow cores.`,
      `The cave descent changed her practice forever. Standing before the hinge, she understood cartography as diplomacy — drawing borders between worlds so neither collapsed. Her maps gained a new layer: not just depth, but intention. She charted where the seal pressed, where it eased, where Elias's vigilance mattered most.`,
      `After they shut the door, she drew the cave from memory with tears salt-blurring the ink. The map was the most honest work of her career. She labeled it only with coordinates and a single word in the margin: Hinge. Her supervisor never saw it. Elias kept it in the journal instead.`
    ),
    3,
    { from: '1913-09-01', to: '1914-05-30' },
    'Cartography as diplomacy with the seal'
  ),
  section(
    'mira-4',
    'Arguments and Alliances',
    prose(
      `Friendship between keepers and cartographers was not in any Council manual. Vance suggested it was dangerous. Mira suggested Vance had never been seven on a jetty. The argument ended when fractures in the cellar worsened and politics became irrelevant.`,
      `Elias wanted to bear the burden alone — Thornwick reflex, she called it. She wanted shared watch rotations and public harbor drills disguised as safety exercises. They compromised: she would not live in the tower, but she would not leave Marrowvale until the stress lines stabilized.`,
      `Village women taught her to mend nets; she taught their sons to read contour lines. Harbor master borrowed her maps for real navigation and joked that her depths were fantasy. She let him joke. Fantasy that kept ships off the shale was still truth wearing a polite coat.`,
      `Letters from her mother asked when she would return to sensible work inland. Mira wrote back: Sensible is keeping my friend alive. Her mother did not understand. Mothers rarely understand the geography of loyalty.`,
      `On the night they reinforced the door with skiff iron, Mira held the lantern while Elias worked. The hum matched her pulse. She thought: this is the map I was always making — not land, but continuity. Two children on a jetty, grown into a line that held.`
    ),
    4,
    { from: '1914-06-01', to: '1915-12-31' },
    'Shared vigilance and village trust'
  ),
  section(
    'mira-5',
    'The Map She Keeps',
    prose(
      `Mira left Marrowvale twice — once for Survey conference, once for her mother's funeral — and both times the hinge pressed in her absence. Elias's telegrams were terse: HUM LONG. DOOR WARM. She returned faster each time. The Council offered her a post charting sealed regions full-time. She negotiated remote work with quarterly site presence. They thought they had recruited her. She knew she had recruited them.`,
      `Her published atlases never showed the hinge. They showed harbors, depths, safe channels — the public face of care. Privately she maintained the Hinge Map, updated each season, shared only with Elias and, reluctantly, Vance. It became the template for other keeper-cartographer pairs along the Meridian.`,
      `When Elias asked why she stayed, she said, "Because you spin and call it honesty." He said, "Because you draw doors and call them coastlines." They were both right. Friendship is a long argument that becomes a harbor.`,
      `In her later years, students asked how she learned to map the unmappable. She told them about a lighthouse and a cave and a door that opened a finger's width. She did not tell them everything. Some knowledge requires presence, not lecture.`,
      `The last letter Elias sent arrived after his death — arranged by harbor protocol, delayed by grief. Inside, a charcoal X on a scrap of jetty map. No words. None needed. She framed it above her desk and kept drawing lines that held the world steady.`
    ),
    5,
    { from: '1916-01-01', to: '1931-10-03' },
    'Legacy of the hinge map'
  ),
];

const miraChapters: DemoLoreChapter[] = [
  {
    id: 'mira-ch-1',
    title: 'Jetty',
    start_date: '1898-06-01',
    end_date: '1913-03-31',
    description: 'Childhood with Elias and the first map',
    summary: 'Compass, crabs, and the X that would outlast distance.',
  },
  {
    id: 'mira-ch-2',
    title: 'Return',
    start_date: '1913-04-01',
    end_date: '1913-08-31',
    description: 'Survey assignment brings her home',
    summary: 'Official roles and the impossible map.',
  },
  {
    id: 'mira-ch-3',
    title: 'Hinge',
    start_date: '1913-09-01',
    end_date: '1914-05-30',
    description: 'Mapping a lock that responds to care',
    summary: 'The cave, the door, and cartography as diplomacy.',
  },
  {
    id: 'mira-ch-4',
    title: 'Alliance',
    start_date: '1914-06-01',
    end_date: '1915-12-31',
    description: 'Shared watch with Elias and the village',
    summary: 'Arguments, iron bands, and public trust.',
  },
  {
    id: 'mira-ch-5',
    title: 'Continuity',
    start_date: '1916-01-01',
    end_date: '1931-10-03',
    description: 'Atlases public and private',
    summary: 'The Hinge Map and the last charcoal X.',
  },
];

// ─── Book 3: Charting the Unseen ──────────────────────────────────────────────

const chartingSections: DemoMemoirSection[] = [
  section(
    'chart-1',
    'Ink and Instrument',
    prose(
      `Every cartographer begins with tools. Mira's first kit weighed more than she did — brass dividers, plane table, chains for measuring ground, inks that smelled of iron and possibility. Her instructor, Professor Hale, said: "You do not draw land. You draw decisions about land." She wrote the sentence on her palm and copied it into the cracked notebook from childhood.`,
      `Training began with visible coastlines — harbors, headlands, safe channels. Students competed for precision. Mira competed for meaning. Her maps included footpaths elders used, wells that never froze, cliffs where birds nested and fishermen swore off nets. Hale called this sentimental. She called it complete.`,
      `The Survey's advanced course introduced depth sounding and triangulation across fog. Mira excelled. Numbers calmed her the way the jetty had — fixed points in moving world. She dreamed of returning to Marrowvale with legitimate reason. The assignment came like answered prayer dressed in bureaucracy.`,
      `Elias's lighthouse appeared on no official chart at correct scale. Its influence extended into water depths that changed with moon phase. Mira's skill arc began here: learning that some features were not geographic but relational. The lamp was a datum. The keeper was part of the instrument.`,
      `She coined a private term: lumetric drift — the way seal-light bent measurements. Publishing it would end her career. Using it kept Marrowvale alive. Skill, she learned, is knowing which truths stay in the margin.`
    ),
    1,
    { from: '1910-09-01', to: '1913-06-30' },
    'Formal training and the concept of lumetric drift'
  ),
  section(
    'chart-2',
    'Depth That Argues Back',
    prose(
      `Sounding lines in Marrowvale bay returned depths that disagreed with themselves. Mira lowered weight on calm days and storm days, morning and night, lamp on and lamp off. With the beam sweeping, depths shallowed near the cave mouth — as if the sea rose toward the seal. Without the beam, the bottom dropped into profiles she could not reconcile.`,
      `She built a table of corrections — Elias's rotation schedule against her soundings. Correlation was undeniable. The hinge affected not just rock but water column. She taught Elias to read her tables. He taught her to hear stress in the hum — a half-tone higher before fractures.`,
      `Vance provided historical soundings from Council archives. Seventy years of data showed slow migration of the anomaly toward the lighthouse. The seal was consolidating, Vance said. Or waking. Mira refused both metaphors. She said: adjusting.`,
      `Her skill grew into choreography — when to measure, when to rest the lamp, when to walk the cave with iron rods tapping stone. Each tap a pixel. Each season a layer. The Hinge Map gained depth contours that moved like weather.`,
      `Survey headquarters demanded standardized sheets. Mira submitted standardized lies and kept the true map in a tube labeled JETTY — childhood camouflage for adult stakes.`
    ),
    2,
    { from: '1913-07-01', to: '1914-04-30' },
    'Sounding the seal\'s influence'
  ),
  section(
    'chart-3',
    'Cartography of Doors',
    prose(
      `Council libraries described twelve sealed regions along the Meridian. Mira studied them like a language family — common grammar of iron, coral, hum. Deserts with sand doors. Mountains with air doors. Marrowvale's water door was among the oldest.`,
      `She developed notation: dashed lines for pressure, dotted for memory bleed, solid for physical stone. Elias's ancestral recollections aligned with dotted zones — places he "remembered" without living. The lighthouse stored lineage like a library stores volumes.`,
      `Teaching became part of her craft. She trained a harbor boy, Tomas, to copy charts without copying the hinge. Public maps for Tomas. Private maps for keepers. Compartmentalization as mercy.`,
      `When the door opened a finger's width, her instruments recorded a spike in lumetric drift across the entire bay. She mapped the spike in real time — charcoal on board, hands shaking, Elias reading hum aloud like a metronome. The map of that night looked like a star exploding. It was the most accurate thing she ever drew.`,
      `Afterward she formalized a protocol: Event Cartography. When seals stress, measure faster, not slower. The Council adopted it without crediting her. She did not mind. Credit was a surface feature.`
    ),
    3,
    { from: '1914-05-01', to: '1916-08-31' },
    'Notation for impossible geography'
  ),
  section(
    'chart-4',
    "The Survey's Blind Spot",
    prose(
      `Institutions protect themselves from wonder by calling it error. Mira's supervisors labeled her Marrowvale corrections "instrument fatigue." She responded with duplicate instruments, duplicate observers, signed witness forms. Elias signed as Keeper Witness. Vance signed as Council Witness. Paper became armor.`,
      `She learned politics the way she learned tides — by watching cycles. Budget seasons. Promotion panels. Retirement of hostile supervisors. She stayed polite, stayed precise, stayed indispensable. Indispensability was leverage.`,
      `A rival cartographer attempted to publish a simplified coast without her anomalies. Fishing boats grounded on the shale he called safe. No one died — luck and harbor gossip saved them. The rival was reassigned inland. Mira did not celebrate. She updated the public chart and the private hinge layer the same afternoon.`,
      `Her skill arc peaked not in a single triumph but in routine: quarterly soundings, annual cave surveys, nightly correlation with lamp logs. Mastery looked like boredom from outside. From inside, it was a heartbeat.`,
      `Professor Hale, retired, visited once. She showed him the Hinge Map. He cried without understanding why. She said, "We draw decisions about land." He said, "You drew a decision about responsibility."`
    ),
    4,
    { from: '1916-09-01', to: '1920-12-31' },
    'Institutional resistance and mastery through routine'
  ),
  section(
    'chart-5',
    'Lines That Hold',
    prose(
      `Mira trained six keeper-cartographer pairs before Elias died. Each pair received a copy of her notation guide and a lecture: You are not documenting fantasy. You are documenting maintenance of a world that prefers not to announce itself.`,
      `Her atlases won Meridian prizes for coastal accuracy. Judges praised her "empirical restraint." If they had seen the margins — lumetric tables, hum correlations, door widths — they would have fainted or funded her forever.`,
      `She never married. She had a harbor house, a wall of maps, students who wrote from distant lighthouses asking about drift. She answered every letter. Some skills pass through ink.`,
      `Near the end she blinded slowly — cataracts, irony of a cartographer. She could still feel paper grain, still hear a student's description and say: deeper there, you missed the hinge. Touch became her last instrument.`,
      `When she died, the Survey found only one map in her tube labeled JETTY. Public coordinates. Private depth. Elias's charcoal X. They archived it as historical curiosity. Keepers along the Meridian copied it by hand, as she would have wanted — lines that hold, passed onward.`
    ),
    5,
    { from: '1921-01-01', to: '1931-10-03' },
    'Teaching the craft and final legacy'
  ),
];

const chartingChapters: DemoLoreChapter[] = [
  {
    id: 'chart-ch-1',
    title: 'Tools',
    start_date: '1910-09-01',
    end_date: '1913-06-30',
    description: 'Meridian Survey training',
    summary: 'Professor Hale and the birth of lumetric drift.',
  },
  {
    id: 'chart-ch-2',
    title: 'Soundings',
    start_date: '1913-07-01',
    end_date: '1914-04-30',
    description: 'Depth that changes with the beam',
    summary: 'Tables, correlations, and the adjusting seal.',
  },
  {
    id: 'chart-ch-3',
    title: 'Notation',
    start_date: '1914-05-01',
    end_date: '1916-08-31',
    description: 'Mapping doors and events',
    summary: 'Council libraries and the night the door opened.',
  },
  {
    id: 'chart-ch-4',
    title: 'Politics',
    start_date: '1916-09-01',
    end_date: '1920-12-31',
    description: 'Institutions versus wonder',
    summary: 'Witness forms, grounded boats, and routine mastery.',
  },
  {
    id: 'chart-ch-5',
    title: 'Legacy',
    start_date: '1921-01-01',
    end_date: '1931-10-03',
    description: 'Students and the last map',
    summary: 'Keeper-cartographer pairs and lines that hold.',
  },
];

// ─── Book 4: The Year the Tides Reversed ─────────────────────────────────────

const tidesSections: DemoMemoirSection[] = [
  section(
    'tides-1',
    'January: Still Water',
    prose(
      `The year began wrong and announced itself quietly. On January third, fishermen found the harbor mirror-still at high tide — no current, no lap against pilings, as if the sea had forgotten its contract. Elias recorded normal lamp rotation. Mira recorded zero lumetric drift. Both knew stillness was a kind of warning.`,
      `By the second week, tide tables failed. Low came at noon. High lingered past midnight. Elders said they had seen this once in childhood, before the Thornwick line recommitted to nightly vigil. Elias increased oil reserves. Mira cancelled inland travel.`,
      `Vance arrived without invitation. "Regional event," she said. "Three lighthouses report hum synchronization." Maps spread across the kitchen table — Marrowvale, Spinel Key, Cape Arden — pins vibrating in unison. Mira drew connecting lines. Elias felt them in his teeth.`,
      `The village noticed last. Boats scraped bottom at supposed high water. Wells tasted brackish. Children collected jellyfish in buckets far from usual season. Elias addressed the harbor: patience. Mira addressed the Survey: anomaly year, do not redirect funding.`,
      `January ended with a full moon and a tide that retreated so far the cave mouth stood exposed for six hours. Elias did not approach. Mira sketched from a distance. The door was closed. The iron bands held. The hum was audible to anyone standing on the shale.`
    ),
    1,
    { from: '1914-01-01', to: '1914-01-31' },
    'Opening anomalies and regional synchronization'
  ),
  section(
    'tides-2',
    'Spring: The Sea Inhales',
    prose(
      `February brought reverse currents — water climbing rivers instead of descending. Salmon confused fishermen and bears alike. Mira charted inversion zones daily, colors bleeding across her maps like bruises. Elias slept two hours a night. The lamp never failed. He suspected it could not fail this year without consequences no one would survive.`,
      `March storms arrived early. Rain fell upward in microbursts near the cave — droplets rising from shale before rejoining clouds. Mira called it atmospheric lumetric bleed. Elias called it exhaustion. Tomas, now sixteen, ran messages between them when fog collapsed visibility.`,
      `The hinge door warmed. Not hot — feverish. Elias felt it through boot soles fifty yards away. Council messages stacked: Hold. Do not open. Do not close further. Contradictory orders from people who had never stood on wet rock at 3 a.m.`,
      `Mira proposed a controlled release — not opening, but listening. She and Elias sat at the cave mouth with resonant rods, tapping in the pattern of lighthouse rotation. The hum answered in phased chords. For a moment the tide reversed visibly, water climbing the cliff face in a sheet before collapsing back. Proof of conversation.`,
      `Spring equinox inspection with Vance became crisis summit. Fractures widened. Vance authorized reinforcement and forbidden ritual. Elias authorized ritual and forbidden despair. They chose both.`
    ),
    2,
    { from: '1914-02-01', to: '1914-05-31' },
    'Escalation and the first deliberate dialogue with the seal'
  ),
  section(
    'tides-3',
    'Summer: Bottles Every Dawn',
    prose(
      `Messages in bottles multiplied — not one or three but dozens, lining the high-tide mark like a library shelf. Languages stacked upon languages. Mira cataloged. Elias burned none. Trust had changed.`,
      `Some bottles contained maps of undersea corridors — proof the sealed civilization still charted itself. Mira wept over them, not from sadness but overload. Her skill and the hinge's skill were the same language finally answering.`,
      `Village mood turned. Still no deaths, but dreams spread — shared dreams of glass cities, geometry walking upright. Elias admitted he dreamed them too. Collective memory bleed, Vance said. Keepers absorb; villages adjacent absorb residue.`,
      `Tomas asked to learn the rods. Mira taught him. Elias taught him lamp emergency protocols. The year was manufacturing apprentices under pressure.`,
      `Longest day: tide reversed at noon for nine minutes exactly. Harbor emptied. Ships listed on mud. Gulls screamed. Then water returned in a single wave gentler than it had any right to be. Elias wrote: The hinge apologizes. Mira wrote: The hinge negotiates.`
    ),
    3,
    { from: '1914-06-01', to: '1914-08-31' },
    'Peak strangeness and community absorption'
  ),
  section(
    'tides-4',
    'Autumn: Iron and Equinox',
    prose(
      `Reinforcement began in September — iron from Elias's father's skiff melted down, shaped by a smith who asked no questions because his son dreamed geometry too. Mira oversaw fit. Elias oversaw hum response. Each band tightened lowered the chord half a step.`,
      `Council inspectors arrived for solstice with instruments Mira distrusted. She duplicated every reading. Vance blocked a proposal to "relieve" Elias — bureaucratic word for replace. Loyalty among strangers formed under strain.`,
      `The door opened one finger's width on September twenty-second without wind or touch. Light from within — not fire, not bioluminescence, something older. Elias sat before it and did not enter. Mira recorded. Tomas held the lantern without shaking.`,
      `Images came again: the bargained civilization, the first seals, Thornwicks chosen for frequency. Elias understood his year — not punishment but initiation. The tide reversed because the hinge tested whether the line still listened.`,
      `Closing required both palms and both voices — Elias humming rotation rhythm, Mira reading coordinates aloud. The door shut. Iron sang. Bottles shattered on the shore like applause finally ending.`
    ),
    4,
    { from: '1914-09-01', to: '1914-10-31' },
    'Reinforcement and the equinox test'
  ),
  section(
    'tides-5',
    'December: Ordinary Water',
    prose(
      `Tides normalized slowly, like a fever breaking. December tables matched predictions within tolerance. Fishermen trusted depth again. Children stopped dreaming in unison. Tomas slept an entire night.`,
      `Elias collapsed for three days — first rest since January. Mira kept watch alone, copying the year's maps into a single volume labeled 1914. Vance took copies for Council archives. She called it the Reversal Year. Marrowvale called it the long season.`,
      `Lessons extracted: seals test keepers; villages absorb bleed; cartographers must be present not remote; iron matters; ritual is maintenance not superstition. Mira presented findings at Survey conference under bland title Coastal Anomalies. Experts asked technical questions. She answered technically. Truth stayed in the room with those who had lived it.`,
      `Elias and Mira walked the jetty on New Year's Eve. Same place they met. "We survived a story," she said. He said, "We survived a responsibility." Waves lapped right direction. Normal sound. Beautiful sound.`,
      `The lighthouse beam turned. The hinge hummed one clear note — satisfied, or as close to satisfied as ancient doors get. The year ended. Ordinary water returned. Neither of them trusted ordinary again, which was the final gift of 1914: vigilance without panic, attention without drama. The work continued quieter, deeper, true.`
    ),
    5,
    { from: '1914-11-01', to: '1914-12-31' },
    'Resolution and the lessons of the reversal year'
  ),
];

const tidesChapters: DemoLoreChapter[] = [
  {
    id: 'tides-ch-1',
    title: 'Still Water',
    start_date: '1914-01-01',
    end_date: '1914-01-31',
    description: 'When the harbor forgot to move',
    summary: 'Failed tide tables and the first synchronized hum.',
  },
  {
    id: 'tides-ch-2',
    title: 'Inhale',
    start_date: '1914-02-01',
    end_date: '1914-05-31',
    description: 'Reverse currents and resonant rods',
    summary: 'Dialogue with the hinge begins under pressure.',
  },
  {
    id: 'tides-ch-3',
    title: 'Bottles',
    start_date: '1914-06-01',
    end_date: '1914-08-31',
    description: 'Peak anomaly and shared dreams',
    summary: 'The library of messages and the nine-minute reversal.',
  },
  {
    id: 'tides-ch-4',
    title: 'Equinox',
    start_date: '1914-09-01',
    end_date: '1914-10-31',
    description: 'Iron bands and the finger-width opening',
    summary: 'Initiation, images, and the deliberate closing.',
  },
  {
    id: 'tides-ch-5',
    title: 'Ordinary',
    start_date: '1914-11-01',
    end_date: '1914-12-31',
    description: 'Return to predictable water',
    summary: 'Collapse, archive, and the jetty on New Year\'s Eve.',
  },
];

// ─── Catalog & exports ────────────────────────────────────────────────────────

const DEMO_TIMESTAMP = '2024-06-01T12:00:00.000Z';

export const DEMO_LOREBOOKS: DemoLorebook[] = [
  {
    id: 'demo-1',
    title: 'The Keeper of Marrowvale',
    scope: 'Full biography',
    period: '1891 – 1924',
    chapters: 5,
    pages: 48,
    gradient: 'from-purple-900 via-purple-800 to-indigo-900',
    accent: 'text-purple-300',
    border: 'border-purple-700/40',
    lastRead: '2 days ago',
    outline: {
      id: 'demo-1',
      title: 'The Keeper of Marrowvale',
      lastUpdated: DEMO_TIMESTAMP,
      autoUpdate: false,
      metadata: { languageStyle: 'literary', originalDocument: false },
      sections: keeperSections,
    },
    loreChapters: keeperChapters,
  },
  {
    id: 'demo-2',
    title: 'Mira Solenne',
    scope: 'A friendship',
    period: '1898 – 1931',
    chapters: 5,
    pages: 44,
    gradient: 'from-rose-900 via-pink-800 to-rose-900',
    accent: 'text-pink-300',
    border: 'border-pink-700/40',
    lastRead: '1 week ago',
    outline: {
      id: 'demo-2',
      title: 'Mira Solenne',
      lastUpdated: DEMO_TIMESTAMP,
      autoUpdate: false,
      metadata: { languageStyle: 'literary', originalDocument: false },
      sections: miraSections,
    },
    loreChapters: miraChapters,
  },
  {
    id: 'demo-3',
    title: 'Charting the Unseen',
    scope: 'Skill arc',
    period: '1910 – 1931',
    chapters: 5,
    pages: 42,
    gradient: 'from-cyan-900 via-teal-800 to-cyan-900',
    accent: 'text-cyan-300',
    border: 'border-cyan-700/40',
    lastRead: '3 days ago',
    outline: {
      id: 'demo-3',
      title: 'Charting the Unseen',
      lastUpdated: DEMO_TIMESTAMP,
      autoUpdate: false,
      metadata: { languageStyle: 'literary', originalDocument: false },
      sections: chartingSections,
    },
    loreChapters: chartingChapters,
  },
  {
    id: 'demo-4',
    title: 'The Year the Tides Reversed',
    scope: 'Life era',
    period: '1914',
    chapters: 5,
    pages: 40,
    gradient: 'from-amber-900 via-orange-800 to-amber-900',
    accent: 'text-amber-300',
    border: 'border-amber-700/40',
    lastRead: 'Today',
    outline: {
      id: 'demo-4',
      title: 'The Year the Tides Reversed',
      lastUpdated: DEMO_TIMESTAMP,
      autoUpdate: false,
      metadata: { languageStyle: 'literary', originalDocument: false },
      sections: tidesSections,
    },
    loreChapters: tidesChapters,
  },
];

/** Library card metadata (no outline payload). */
export const DEMO_LOREBOOK_CATALOG: DemoLorebookCatalogEntry[] = DEMO_LOREBOOKS.map(
  ({ outline: _o, loreChapters: _c, ...catalog }) => catalog
);

export const DEFAULT_DEMO_LOREBOOK = DEMO_LOREBOOKS[0];

export function getDemoLorebookById(bookId: string): DemoLorebook | undefined {
  return DEMO_LOREBOOKS.find((book) => book.id === bookId);
}
