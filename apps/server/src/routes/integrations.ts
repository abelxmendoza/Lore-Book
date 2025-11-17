import { Router } from 'express';

import { githubRouter } from '../integrations/github/github.router';
import { instagramRouter } from '../integrations/instagram/instagram.router';

const router = Router();

router.use('/github', githubRouter);
router.use('/instagram', instagramRouter);

export const integrationsRouter = router;
