import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  MAX_SUGGESTION_DISMISSALS,
  normalizeSuggestionDismissalName,
  suggestionDismissalService,
  type RecordDismissalResult,
  type SuggestionDismissalDomain,
} from '../services/suggestionDismissalService';
import { projectSuggestionService } from '../services/projects/projectSuggestionService';
import { skillSuggestionService } from '../services/skills/skillSuggestionService';
import { questSuggestionService } from '../services/quests/questSuggestionService';
import { entityLearningService } from '../services/entityLearningService';

const router = Router();

const dismissSchema = z.object({
  book_domain: z.enum(['projects', 'skills', 'quests', 'locations', 'characters']),
  name: z.string().trim().min(1),
  suggestion_id: z.string().optional(),
  source_message_id: z.string().optional(),
  thread_id: z.string().optional(),
});

function dismissResponse(result: RecordDismissalResult | null, domain: SuggestionDismissalDomain, name: string) {
  const dismissCount = result?.dismissCount ?? 0;
  return {
    success: true,
    dismiss_count: dismissCount,
    is_permanent: result?.isPermanent ?? false,
    remaining_until_permanent: Math.max(0, MAX_SUGGESTION_DISMISSALS - dismissCount),
    thread_id: result?.threadId ?? null,
    normalized_name: result?.normalizedName || normalizeSuggestionDismissalName(domain, name),
  };
}

router.post('/dismiss', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = dismissSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid dismiss payload', details: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.id;
  const { book_domain, name, suggestion_id, source_message_id, thread_id } = parsed.data;
  const domain = book_domain as SuggestionDismissalDomain;
  let result: RecordDismissalResult | null = null;

  if (domain === 'projects') {
    result = suggestion_id
      ? await projectSuggestionService.rejectSuggestion(userId, suggestion_id, { threadId: thread_id })
      : await projectSuggestionService.rejectByName(userId, name, {
          threadId: thread_id,
          sourceMessageId: source_message_id,
          suggestionId: suggestion_id,
        });
  } else if (domain === 'skills') {
    result = suggestion_id
      ? await skillSuggestionService.rejectSuggestion(userId, suggestion_id, { threadId: thread_id })
      : await skillSuggestionService.rejectByName(userId, name, {
          threadId: thread_id,
          sourceMessageId: source_message_id,
          suggestionId: suggestion_id,
        });
  } else if (domain === 'quests') {
    result = suggestion_id
      ? await questSuggestionService.rejectSuggestion(userId, suggestion_id, { threadId: thread_id })
      : await questSuggestionService.rejectByTitle(userId, name, {
          threadId: thread_id,
          sourceMessageId: source_message_id,
          suggestionId: suggestion_id,
        });
  } else {
    result = await suggestionDismissalService.recordDismissal(userId, domain, {
      name,
      threadId: thread_id,
      sourceMessageId: source_message_id,
      sourceSuggestionId: suggestion_id,
    });
  }

  void entityLearningService.recordSuggestionDismissalLearning({
    userId,
    domain,
    name,
    result,
    sourceSuggestionId: suggestion_id,
    sourceMessageId: source_message_id,
  });

  res.json(dismissResponse(result, domain, name));
}));

export const suggestionsRouter = router;
