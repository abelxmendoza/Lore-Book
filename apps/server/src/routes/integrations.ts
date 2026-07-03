import { Router } from 'express';

import { githubRouter } from '../integrations/github/github.router';
import { instagramRouter } from '../integrations/instagram/instagram.router';
import { xIntegrationRouter } from '../integrations/x/x.router';

const router = Router();

router.use('/github', githubRouter);
router.use('/instagram', instagramRouter);
router.use('/x', xIntegrationRouter);

export const integrationsRouter = router;
