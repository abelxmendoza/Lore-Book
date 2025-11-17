import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { orchestratorService } from '../services/orchestratorService';

const router = Router();

router.get('/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getSummary(req.user!.id);
  res.json(payload);
});

router.get('/timeline', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getTimeline(req.user!.id);
  res.json(payload);
});

router.get('/identity', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getIdentity(req.user!.id);
  res.json(payload);
});

router.get('/continuity', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getContinuity(req.user!.id);
  res.json(payload);
});

router.get('/saga', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getSaga(req.user!.id);
  res.json(payload);
});

router.get('/characters/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getCharacter(req.user!.id, req.params.id);
  res.json(payload);
});

router.get('/hqi', requireAuth, async (req: AuthenticatedRequest, res) => {
  const query = (req.query.query as string) ?? '';
  const payload = await orchestratorService.searchHQI(query);
  res.json(payload);
});

router.get('/fabric/:memoryId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await orchestratorService.getFabricNeighbors(req.params.memoryId);
  res.json(payload);
});

export const orchestratorRouter = router;
import { Router } from "express";
import { runOrchestrator } from "../services/orchestratorService";

const router = Router();

router.get("/summary", runOrchestrator("summary"));
router.get("/timeline", runOrchestrator("timeline"));
router.get("/identity", runOrchestrator("identity"));
router.get("/continuity", runOrchestrator("continuity"));
router.get("/saga", runOrchestrator("saga"));
router.get("/characters/:id", runOrchestrator("character"));
router.get("/hqi", runOrchestrator("hqi"));
router.get("/fabric/:memoryId", runOrchestrator("fabric"));

export default router;
