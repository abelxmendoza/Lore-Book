/**
 * Global Express.Request augmentation.
 *
 * Merges AuthUser into the base Request type so every route handler —
 * whether typed as `Request` or `AuthenticatedRequest` — sees req.user
 * without a redundant cast. This is the single source of truth for the
 * user shape on the request object.
 */

export type AuthUser = {
  id: string;
  email?: string;
  lastSignInAt?: string | null;
  /** Display name from auth provider user_metadata */
  fullName?: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export {};
