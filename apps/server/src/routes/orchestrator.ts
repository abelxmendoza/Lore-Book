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
