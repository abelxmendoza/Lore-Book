import type { IdentitySnapshot, IdentityThread } from './identitySnapshotTypes';

function joinNaturally(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function identityLead(snapshot: IdentitySnapshot): string {
  const details = [
    snapshot.coreIdentity.education,
    snapshot.coreIdentity.employment,
    snapshot.coreIdentity.location ? `based in ${snapshot.coreIdentity.location}` : null,
  ].filter((value): value is string => Boolean(value));
  const prefix = snapshot.coreIdentity.name ? `${snapshot.coreIdentity.name}, ` : '';
  const dominant = snapshot.threads.filter(thread => thread.salience === 'dominant').slice(0, 3);
  const threadNames = dominant.map(thread => thread.name);

  if (threadNames.length > 0 && details.length > 0) {
    return `${prefix}${joinNaturally(details)}. The strongest through-lines in your life are ${joinNaturally(threadNames)}.`;
  }
  if (threadNames.length > 0) {
    return `${prefix}the strongest through-lines in your life are ${joinNaturally(threadNames)}.`;
  }
  if (details.length > 0) return `${prefix}${joinNaturally(details)}.`;
  return snapshot.coreIdentity.name
    ? `I have a grounded identity record for ${snapshot.coreIdentity.name}, but its defining threads are still sparse.`
    : 'I do not yet have enough grounded evidence to describe who you are.';
}

function threadLine(thread: IdentityThread): string {
  const movement = thread.momentum === 'growing'
    ? 'Growing'
    : thread.momentum === 'declining'
      ? 'Declining'
      : thread.momentum === 'dormant'
        ? 'Dormant'
        : 'Steady';
  return `- **${thread.name}** · ${movement} — ${thread.summary}`;
}

export function composeIdentityRecall(snapshot: IdentitySnapshot): string {
  const sections: string[] = [];
  const lead = identityLead(snapshot);
  const current = snapshot.currentChapter
    ? `Right now, you're in **${snapshot.currentChapter.title}**${snapshot.currentChapter.summary ? `: ${snapshot.currentChapter.summary}` : '.'}`
    : '';
  sections.push(`## Who you are\n${lead}${current ? `\n\n${current}` : ''}`);

  const defining = snapshot.threads.filter(thread => thread.salience !== 'supporting').slice(0, 5);
  if (defining.length > 0) {
    sections.push(`## What defines you\n${defining.map(threadLine).join('\n')}`);
  }

  if (snapshot.goals.length > 0) {
    sections.push(`## What you're working toward\n${snapshot.goals.slice(0, 4).map(goal => `- ${goal.title}`).join('\n')}`);
  }

  const changeLines = snapshot.recentChanges.slice(0, 3).map(change => `- ${change.label}`);
  const people = snapshot.importantPeople.slice(0, 4).map(person => person.name);
  const context: string[] = [];
  if (changeLines.length > 0) context.push(`**Recent shifts**\n${changeLines.join('\n')}`);
  if (people.length > 0) context.push(`**People currently carrying weight**\n${joinNaturally(people)}.`);
  if (context.length > 0) sections.push(`## What's changing around you\n${context.join('\n\n')}`);

  return sections.slice(0, 4).join('\n\n');
}
