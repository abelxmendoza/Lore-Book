import type { SuggestionDomain, SuggestionRescanSummary } from '../api/suggestionRescan';

/** LoreBook corpus parse line for rescan toasts. */
export function formatLorebookParseToastLine(
  lorebookParse: NonNullable<SuggestionRescanSummary['lorebookParse']>
): string {
  const { linesParsed, applied, operationsSeen } = lorebookParse;
  if (linesParsed <= 0 && operationsSeen <= 0) return '';

  if (applied > 0) {
    return `LoreBook parsed ${linesParsed} line${linesParsed === 1 ? '' : 's'} · seeded ${applied} suggestion${applied === 1 ? '' : 's'}`;
  }

  if (linesParsed > 0) {
    return `LoreBook scanned ${linesParsed} line${linesParsed === 1 ? '' : 's'} · ${operationsSeen} signal${operationsSeen === 1 ? '' : 's'} reviewed`;
  }

  return '';
}

function domainResultLine(domain: SuggestionDomain, results: SuggestionRescanSummary['results']): string {
  const row = results[domain];
  if (!row || row.scanned === false) return 'Rescan could not finish for this book.';

  switch (domain) {
    case 'characters': {
      const promoted = Number(row.charactersPromoted ?? 0);
      const restored = Number(row.restoredFromEvidence ?? 0);
      const total = promoted + restored;
      if (total > 0) {
        return `Found ${total} character${total === 1 ? '' : 's'} to add or restore.`;
      }
      return 'Characters are up to date.';
    }
    case 'locations': {
      const count = Number(row.count ?? 0);
      if (count > 0) return `Found ${count} place${count === 1 ? '' : 's'} in your chats.`;
      return 'Places are up to date.';
    }
    case 'quests': {
      const upserted = Number(row.upserted ?? 0);
      if (upserted > 0) return `Found ${upserted} quest${upserted === 1 ? '' : 's'} in your chats.`;
      return 'Quests are up to date.';
    }
    case 'skills': {
      const upserted = Number(row.upserted ?? 0);
      if (upserted > 0) return `Found ${upserted} skill${upserted === 1 ? '' : 's'} in your chats.`;
      return 'Skills are up to date.';
    }
    case 'projects': {
      const upserted = Number(row.upserted ?? 0);
      if (upserted > 0) return `Found ${upserted} project${upserted === 1 ? '' : 's'} in your chats.`;
      return 'Projects are up to date.';
    }
    case 'romantic': {
      const summary = row.summary as { relationshipsUpserted?: number } | undefined;
      const total = summary?.relationshipsUpserted ?? 0;
      if (total > 0) return `Updated ${total} relationship${total === 1 ? '' : 's'} from your chats.`;
      return 'Love story is up to date.';
    }
    default:
      return 'Conversation rescan complete.';
  }
}

/** Full toast body: domain outcome + optional LoreBook parse stats. */
export function formatSuggestionRescanToast(
  summary: SuggestionRescanSummary,
  primaryDomain: SuggestionDomain
): string {
  const base = domainResultLine(primaryDomain, summary.results);
  const loreLine = summary.lorebookParse ? formatLorebookParseToastLine(summary.lorebookParse) : '';
  if (!loreLine) return base;
  return `${base} ${loreLine}`;
}

/** Append LoreBook stats to an existing inline rescan notice. */
export function appendLorebookParseToast(
  baseMessage: string,
  summary: SuggestionRescanSummary
): string {
  const loreLine = summary.lorebookParse ? formatLorebookParseToastLine(summary.lorebookParse) : '';
  if (!loreLine) return baseMessage;
  return `${baseMessage} ${loreLine}`;
}
