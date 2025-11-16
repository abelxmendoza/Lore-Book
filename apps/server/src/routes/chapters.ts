import { Router } from 'express';

import { requireAuth } from '../middleware/auth';
import {
  createChapter,
  detectChapterCandidates,
  getChapterEntries,
  listChapters,
  summarizeChapter
} from '../controllers/chaptersController';

const router = Router();

router.post('/', requireAuth, createChapter);
router.get('/', requireAuth, listChapters);
router.get('/candidates', requireAuth, detectChapterCandidates);
router.get('/:chapterId', requireAuth, getChapterEntries);
router.post('/:chapterId/summary', requireAuth, summarizeChapter);

export const chaptersRouter = router;
