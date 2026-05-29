import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const [chars, locs, evts, orgs, skills] = await Promise.all([
      supabaseAdmin.from('characters').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('omega_entities').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('entity_type', 'LOCATION'),
      supabaseAdmin.from('event_candidates').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('organizations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('skills').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    res.json({
      characters: chars.count ?? 0,
      locations: locs.count ?? 0,
      events: evts.count ?? 0,
      organizations: orgs.count ?? 0,
      skills: skills.count ?? 0,
    });
  } catch {
    res.json({ characters: 0, locations: 0, events: 0, organizations: 0, skills: 0 });
  }
});

export { router as countsRouter };
