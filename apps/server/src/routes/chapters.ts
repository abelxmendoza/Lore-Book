import { Router } from 'express';

import { requireAuth } from '../middleware/auth';
import { createChapter, listChapters, summarizeChapter } from '../controllers/chaptersController';

const router = Router();

router.post('/', requireAuth, createChapter);
router.get('/', requireAuth, listChapters);
router.post('/:chapterId/summary', requireAuth, summarizeChapter);

export const chaptersRouter = router;
