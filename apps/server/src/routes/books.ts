/**
 * Books BFF — one aggregate round-trip per LoreBook surface.
 * Legacy per-entity routes remain unchanged; nothing is deleted.
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccessDual } from '../utils/apiResponse';
import {
  loadCharactersBook,
  loadDiscoverySummary,
  loadFamilyBook,
  loadLocationsBook,
  loadProjectsBook,
  loadSkillsBook,
} from '../services/books/booksAggregateService';

const router = Router();

router.get(
  '/characters',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await loadCharactersBook(req.user!.id);
    sendSuccessDual(res, data);
  })
);

router.get(
  '/locations',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await loadLocationsBook(req.user!.id);
    sendSuccessDual(res, data);
  })
);

router.get(
  '/projects',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await loadProjectsBook(req.user!.id);
    sendSuccessDual(res, data);
  })
);

router.get(
  '/skills',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await loadSkillsBook(req.user!.id);
    sendSuccessDual(res, data);
  })
);

router.get(
  '/family',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await loadFamilyBook(req.user!.id);
    sendSuccessDual(res, { success: true, ...data });
  })
);

router.get(
  '/discovery',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await loadDiscoverySummary(req.user!.id);
    sendSuccessDual(res, data);
  })
);

export const booksRouter = router;
