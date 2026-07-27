/**
 * Best-effort sex guess from a person's first name — the lowest-priority
 * fallback in the sex-inference chain (see sexFromKinship.ts's precedence:
 * user_confirmed/explicit > kinship_inferred > name_inferred > unknown).
 *
 * Deliberately conservative: a curated list of names confident enough to
 * guess on, plus an explicit unisex/ambiguous list that always returns null
 * even though the name is common — guessing wrong on a name like "Jordan" or
 * "Alex" is worse than admitting we don't know. Never used to overwrite a
 * kinship-title-based inference, which is far more reliable than a name.
 */

// Names that go either way often enough that a guess would be wrong too
// often to be useful — always return null for these, checked before the
// male/female lists so an accidental cross-listing can never win.
const UNISEX_NAMES = new Set([
  'jordan', 'alex', 'taylor', 'casey', 'morgan', 'riley', 'jamie', 'cruz',
  'avery', 'quinn', 'skyler', 'skylar', 'rowan', 'reese', 'reagan', 'peyton',
  'dakota', 'emerson', 'finley', 'hayden', 'jesse', 'jessie', 'kai', 'lane',
  'logan', 'sage', 'shawn', 'sean', 'shay', 'charlie', 'frankie', 'blake',
  'drew', 'eden', 'elliot', 'elliott', 'jules', 'kendall', 'lee', 'noel',
  'remy', 'river', 'robin', 'ryan', 'sam', 'samuel', 'sammy', 'val', 'ariel',
  'guadalupe', 'trinidad', 'andrea', // "Andrea" is male in Italian, female in English/Spanish
]);

const MALE_NAMES = new Set([
  // English
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob',
  'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott',
  'brandon', 'benjamin', 'samuel', 'gregory', 'frank', 'raymond', 'alexander',
  'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'henry',
  'adam', 'douglas', 'nathan', 'peter', 'zachary', 'kyle', 'walter', 'harold',
  'carl', 'jeremy', 'gerald', 'keith', 'roger', 'terry', 'austin', 'sean',
  'christian', 'ethan', 'noah', 'liam', 'mason', 'lucas', 'oliver', 'elijah',
  'owen', 'wyatt', 'caleb', 'isaac', 'connor', 'colin', 'evan', 'ian',
  'marcus', 'derek', 'travis', 'cody', 'devin', 'dominic', 'jared', 'cole',
  // Spanish
  'jose', 'juan', 'luis', 'carlos', 'jesus', 'miguel', 'javier', 'francisco',
  'antonio', 'manuel', 'pedro', 'rafael', 'ricardo', 'fernando', 'sergio',
  'alejandro', 'diego', 'eduardo', 'roberto', 'mario', 'oscar', 'raul',
  'jorge', 'martin', 'victor', 'ruben', 'hector', 'ivan', 'gustavo', 'arturo',
  'alberto', 'armando', 'enrique', 'guillermo', 'gerardo', 'rodrigo', 'salvador',
  'esteban', 'emilio', 'julio', 'marco', 'cesar', 'angel', 'adrian', 'ramon',
  'tomas', 'santiago', 'agustin', 'alfredo', 'benito', 'ernesto', 'joaquin',
  'lorenzo', 'pablo', 'vicente', 'abel', 'isaias', 'moises', 'gabriel', 'daniel',
]);

const FEMALE_NAMES = new Set([
  // English
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'margaret', 'betty', 'sandra',
  'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'carol', 'amanda',
  'melissa', 'deborah', 'stephanie', 'rebecca', 'laura', 'sharon', 'cynthia',
  'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma',
  'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra', 'rachel',
  'catherine', 'carolyn', 'janet', 'ruth', 'maria', 'heather', 'diane', 'julie',
  'joyce', 'victoria', 'kelly', 'christina', 'joan', 'lauren',
  'judith', 'megan', 'olivia', 'sophia', 'ava', 'isabella', 'mia',
  'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'ella', 'grace',
  'chloe', 'lily', 'natalie', 'zoe', 'hannah', 'madison', 'brooke', 'paige',
  'destiny', 'kayla', 'jasmine', 'alexis', 'alyssa', 'savannah', 'sydney',
  // Spanish
  'maria', 'guadalupe', 'juana', 'margarita', 'rosa', 'carmen', 'gabriela',
  'alejandra', 'veronica', 'patricia', 'monica', 'silvia', 'claudia', 'diana',
  'adriana', 'liliana', 'yolanda', 'graciela', 'esperanza', 'consuelo',
  'dolores', 'josefina', 'teresa', 'gloria', 'elena', 'lourdes', 'norma',
  'beatriz', 'leticia', 'martha', 'blanca', 'irma', 'olga', 'lucia', 'sofia',
  'valeria', 'daniela', 'fernanda', 'paula', 'camila', 'ximena', 'renata',
  'isabel', 'pilar', 'mercedes', 'soledad', 'rocio', 'araceli', 'esmeralda',
]);

export type InferredSex = 'male' | 'female';

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function firstNameToken(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0] ?? '';
  return stripAccents(first).toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Best-effort sex guess from a first name. Returns null for unisex/ambiguous
 * or unrecognized names rather than guessing — callers must never treat null
 * as "unknown, guess something anyway."
 */
export function sexFromFirstName(name: string): InferredSex | null {
  const token = firstNameToken(name);
  if (!token || token.length < 2) return null;
  if (UNISEX_NAMES.has(token)) return null;
  if (MALE_NAMES.has(token) && FEMALE_NAMES.has(token)) return null;
  if (MALE_NAMES.has(token)) return 'male';
  if (FEMALE_NAMES.has(token)) return 'female';
  return null;
}
