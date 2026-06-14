# Demo Mode Privacy and Sync Policy

Demo Mode is a reusable fictional showcase. It must never contain real Lorebook account data, real user relationships, real employer/recruiter names, or private story details copied from any account.

## Required Guardrails

- Every authenticated API response must be scoped to the requesting account. If a response contains `user_id` or `userId`, it must match `req.user.id`.
- Server code uses service-role Supabase access internally, so every query that reads, updates, deletes, or links user-owned rows must include an explicit `user_id` predicate or call a service that does.
- Mock and Demo Mode fixtures must use fictional names, companies, families, schools, locations, and story details.
- Demo Mode must not fall back to live account data. If Demo Mode lacks data for a feature, add fictional fixture data instead of reusing a real user record.
- New application filters, cards, modals, tabs, ranking views, and analytics sections must include matching fictional demo data in the same PR/change.

## Validation

Run these checks before shipping changes that touch account data or Demo Mode:

```bash
npm run check:demo-privacy
cd apps/server && npx vitest run src/middleware/userIsolationGuard.test.ts
cd apps/web && npm run build
```

For Supabase schema changes, keep RLS enabled on exposed tables and use owner policies with `(select auth.uid()) = user_id` for `SELECT`, `UPDATE`, and `DELETE`; `UPDATE` also needs a matching `WITH CHECK`.
