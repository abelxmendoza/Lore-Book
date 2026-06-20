import { MilestoneSignificance } from './projectChronicleTypes';

/** How often background source scans run (ms). */
export const CHRONICLE_BACKGROUND_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Only MAJOR (4) and TRANSFORMATIONAL (5) enter the chronicle pipeline. */
export const MIN_PIPELINE_SIGNIFICANCE = MilestoneSignificance.MAJOR;

/** Pending queue: high bar, human review for borderline cases. */
export const MIN_PENDING_CONFIDENCE = 0.78;

/** Auto-promote: must be verified working + very confident. */
export const MIN_AUTO_PROMOTE_CONFIDENCE = 0.88;

/** Minimum verification score (0–1) to treat progress as confirmed working. */
export const MIN_VERIFICATION_SCORE = 0.72;

/** Commits must settle before auto-promote (avoid recording WIP). */
export const COMMIT_SETTLING_MS = 2 * 60 * 60 * 1000;

/** Rate limits — keep the chronicle sparse and meaningful. */
export const MAX_PENDING_QUEUE = 5;
export const MAX_AUTO_PROMOTES_PER_WEEK = 2;
