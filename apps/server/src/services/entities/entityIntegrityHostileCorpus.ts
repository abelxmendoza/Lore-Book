export type HostileEntityFixture = {
  id: string;
  category: string;
  message: string;
  mention: string;
  expectedType: string;
  incompatibleCandidateType: string;
  incompatibleCandidateName: string;
};

/**
 * Deterministic red-team corpus. Candidate names intentionally include exact
 * matches in addition to realistic near-matches: even perfect lexical evidence
 * must never cross the type boundary.
 */
export const ENTITY_INTEGRITY_HOSTILE_CORPUS: HostileEntityFixture[] = [
  { id: 'tool-01', category: 'person-v-tool', message: 'Khalil created Prima AI.', mention: 'Prima AI', expectedType: 'software_tool', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Cousin James' },
  { id: 'tool-02', category: 'person-v-tool', message: 'We use the chatbot Prima AI.', mention: 'Prima AI', expectedType: 'app', incompatibleCandidateType: 'PERSON', incompatibleCandidateName: 'Prima AI' },
  { id: 'tool-03', category: 'person-v-tool', message: 'Open the Atlas app.', mention: 'Atlas', expectedType: 'software_tool', incompatibleCandidateType: 'character', incompatibleCandidateName: 'Atlas' },
  { id: 'tool-04', category: 'person-v-tool', message: 'Nova is our internal coding tool.', mention: 'Nova', expectedType: 'software', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Nova' },
  { id: 'tool-05', category: 'person-v-tool', message: 'I deployed the Beacon platform.', mention: 'Beacon', expectedType: 'platform', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Beacon' },
  { id: 'tool-06', category: 'person-v-tool', message: 'Khalil owns the Mercury chatbot.', mention: 'Mercury', expectedType: 'chatbot', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Mercury' },
  { id: 'project-01', category: 'person-v-project', message: 'Project Falcon launched.', mention: 'Falcon', expectedType: 'project', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Falcon' },
  { id: 'project-02', category: 'person-v-project', message: 'We finished Apollo.', mention: 'Apollo', expectedType: 'PROJECT', incompatibleCandidateType: 'CHARACTER', incompatibleCandidateName: 'Apollo' },
  { id: 'project-03', category: 'person-v-project', message: 'The Orion project is delayed.', mention: 'Orion', expectedType: 'project', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Orion' },
  { id: 'project-04', category: 'person-v-project', message: 'I contributed to Phoenix.', mention: 'Phoenix', expectedType: 'project', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Phoenix' },
  { id: 'country-01', category: 'person-v-country', message: 'Xingpeng grew up in China.', mention: 'China', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Mr. Chino' },
  { id: 'country-02', category: 'person-v-country', message: 'I traveled through Jordan.', mention: 'Jordan', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Jordan' },
  { id: 'country-03', category: 'person-v-country', message: 'She moved from Georgia.', mention: 'Georgia', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Georgia' },
  { id: 'country-04', category: 'person-v-country', message: 'We flew to Chad.', mention: 'Chad', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Chad' },
  { id: 'country-05', category: 'person-v-country', message: 'My family is from Mexico.', mention: 'Mexico', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Mexico' },
  { id: 'country-06', category: 'person-v-country', message: 'I studied in Japan.', mention: 'Japan', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Japan' },
  { id: 'city-01', category: 'person-v-city', message: 'I live in Austin.', mention: 'Austin', expectedType: 'city', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Austin' },
  { id: 'city-02', category: 'person-v-city', message: 'We landed in Paris.', mention: 'Paris', expectedType: 'city', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Paris' },
  { id: 'city-03', category: 'person-v-city', message: 'The office is in Charlotte.', mention: 'Charlotte', expectedType: 'city', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Charlotte' },
  { id: 'city-04', category: 'person-v-city', message: 'I visited Victoria.', mention: 'Victoria', expectedType: 'city', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Victoria' },
  { id: 'location-01', category: 'person-v-location', message: 'Meet me at Catch One.', mention: 'Catch One', expectedType: 'location', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Catch One' },
  { id: 'location-02', category: 'person-v-location', message: 'We ate at Ruby Tuesday.', mention: 'Ruby Tuesday', expectedType: 'location', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Ruby Tuesday' },
  { id: 'location-03', category: 'person-v-location', message: 'I trained at Golds Gym.', mention: 'Golds Gym', expectedType: 'place', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Golds Gym' },
  { id: 'location-04', category: 'person-v-location', message: 'I stayed at Caesars Palace.', mention: 'Caesars Palace', expectedType: 'location', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Caesars Palace' },
  { id: 'org-01', category: 'person-v-organization', message: 'I work at Ring with Ryan.', mention: 'Ring', expectedType: 'organization', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Ringo' },
  { id: 'org-02', category: 'person-v-organization', message: 'I joined Amazon.', mention: 'Amazon', expectedType: 'company', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Amazon' },
  { id: 'org-03', category: 'person-v-organization', message: 'Meta hired her.', mention: 'Meta', expectedType: 'org', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Meta' },
  { id: 'org-04', category: 'person-v-organization', message: 'The Lakers called.', mention: 'Lakers', expectedType: 'group', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Lakers' },
  { id: 'org-05', category: 'person-v-organization', message: 'Acme approved it.', mention: 'Acme', expectedType: 'organization', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Acme' },
  { id: 'org-06', category: 'person-v-organization', message: 'I volunteer with Hope House.', mention: 'Hope House', expectedType: 'organization', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Hope House' },
  { id: 'school-01', category: 'person-v-school', message: "Xingpeng earned his master's from USC.", mention: 'USC', expectedType: 'school', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Ursula C.' },
  { id: 'school-02', category: 'person-v-school', message: 'I graduated from Stanford.', mention: 'Stanford', expectedType: 'university', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Stan Ford' },
  { id: 'school-03', category: 'person-v-school', message: 'She studies at Duke.', mention: 'Duke', expectedType: 'college', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Duke' },
  { id: 'school-04', category: 'person-v-school', message: 'He attends Howard.', mention: 'Howard', expectedType: 'school', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Howard' },
  { id: 'school-05', category: 'person-v-school', message: 'We met on the Berkeley campus.', mention: 'Berkeley', expectedType: 'school', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Berkeley' },
  { id: 'event-01', category: 'person-v-event', message: 'I attended Anime Expo.', mention: 'Anime Expo', expectedType: 'event', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Annie Expo' },
  { id: 'event-02', category: 'person-v-event', message: 'We went to Coachella.', mention: 'Coachella', expectedType: 'event', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Coachella' },
  { id: 'event-03', category: 'person-v-event', message: 'Dreamforce starts Monday.', mention: 'Dreamforce', expectedType: 'event', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Dreamforce' },
  { id: 'event-04', category: 'person-v-event', message: 'The Summit was packed.', mention: 'Summit', expectedType: 'event', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Summit' },
  { id: 'event-05', category: 'person-v-event', message: 'I loved Comic Con.', mention: 'Comic Con', expectedType: 'event', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Comic Con' },
  { id: 'event-06', category: 'person-v-event', message: 'Her wedding was beautiful.', mention: 'Wedding', expectedType: 'event', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Wedding' },
  { id: 'product-01', category: 'person-v-product', message: 'We tested Ring cameras.', mention: 'Ring cameras', expectedType: 'product', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Ringo' },
  { id: 'product-02', category: 'person-v-product', message: 'I bought an Alexa.', mention: 'Alexa', expectedType: 'product', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Alexa' },
  { id: 'product-03', category: 'person-v-product', message: 'The Mustang needs gas.', mention: 'Mustang', expectedType: 'product', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Mustang' },
  { id: 'product-04', category: 'person-v-product', message: 'My Echo arrived.', mention: 'Echo', expectedType: 'product', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Echo' },
  { id: 'product-05', category: 'person-v-product', message: 'I repaired the Atlas device.', mention: 'Atlas', expectedType: 'product', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Atlas' },
  { id: 'noisy-01', category: 'speech-noise', message: 'Primer AI made the summary.', mention: 'Primer AI', expectedType: 'software_tool', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Prima' },
  { id: 'noisy-02', category: 'speech-noise', message: 'Prema AI made the summary.', mention: 'Prema AI', expectedType: 'software_tool', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Prima' },
  { id: 'noisy-03', category: 'speech-noise', message: 'He grew up in Chino—maybe China.', mention: 'China', expectedType: 'country', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Chino' },
  { id: 'noisy-04', category: 'speech-noise', message: 'I work at Ring, not with Ryan.', mention: 'Ring', expectedType: 'organization', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Ryan' },
  { id: 'possessive-01', category: 'possessive', message: "I used Khalil's Prima AI tool.", mention: 'Prima AI', expectedType: 'software_tool', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Khalil' },
  { id: 'possessive-02', category: 'possessive', message: "I opened Jordan's Atlas app.", mention: 'Atlas', expectedType: 'software_tool', incompatibleCandidateType: 'person', incompatibleCandidateName: 'Jordan' },
  { id: 'metaphor-01', category: 'metaphor', message: 'Jimmy is a machine in the lab.', mention: 'Jimmy', expectedType: 'person', incompatibleCandidateType: 'product', incompatibleCandidateName: 'Jimmy' },
  { id: 'metaphor-02', category: 'metaphor', message: 'Ryan is a clown sometimes.', mention: 'Ryan', expectedType: 'person', incompatibleCandidateType: 'event', incompatibleCandidateName: 'Ryan' },
];

