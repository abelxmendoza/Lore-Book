# Lore Keeper System Blueprint - Implementation Guide

This document describes the implementation of the System Blueprint for Lore Keeper.

## ✅ Completed Implementation

### 1. Environment Setup
- ✅ Created `.env.development`, `.env.staging`, `.env.production` template files
- ✅ Updated `config.ts` to load environment-specific `.env` files based on `API_ENV`
- ✅ Added `apiEnv` and `enableExperimental` to config

### 2. Feature Flag System
- ✅ Created `apps/web/src/config/featureFlags.ts` with feature flag definitions
- ✅ Created `apps/web/src/hooks/useFeatureFlag.ts` hook
- ✅ Feature flags respect `ENABLE_EXPERIMENTAL` and admin status

### 3. RBAC Middleware
- ✅ Created `apps/server/src/middleware/rbac.ts` with role-based access control
- ✅ Roles: `admin`, `developer`, `standard_user`, `beta_user`
- ✅ Middleware functions: `requireRole`, `requireAdmin`, `requireDevAccess`, `requireExperimental`

### 4. Admin Console (Production-Facing)
- ✅ Created `apps/server/src/routes/admin.ts` with admin API routes:
  - `GET /api/admin/users` - User metrics
  - `GET /api/admin/logs` - Error logs
  - `GET /api/admin/ai-events` - AI generation logs
  - `POST /api/admin/reindex` - Trigger embedding re-index
  - `POST /api/admin/flush-cache` - Flush cache
  - `POST /api/admin/rebuild-clusters` - Rebuild memory clusters
- ✅ Created `apps/web/src/components/admin/AdminConsole.tsx` with full UI
- ✅ Route: `/admin` (protected by admin role)

### 5. Dev Console (Development Only)
- ✅ Created `apps/server/src/routes/dev.ts` with dev API routes:
  - `GET /api/dev/logs` - Real-time logs
  - `POST /api/dev/seed-db` - Seed test data
  - `POST /api/dev/clear-db` - Clear test data
  - `POST /api/dev/preview-component` - Component preview
  - `POST /api/dev/toggle-flag` - Toggle feature flags
- ✅ Created `apps/web/src/components/dev/DevConsole.tsx` with full UI
- ✅ Route: `/dev-console` (protected by dev access)

### 6. Package.json Scripts
- ✅ Updated root `package.json` with environment-specific scripts:
  - `dev` - Run both web and server in dev mode
  - `staging` - Run server in staging mode
  - `prod` - Run server in production mode

### 7. Safety Rules
- ✅ Dev routes only accessible when `API_ENV === 'dev'` OR user is admin/developer
- ✅ Admin routes require admin role
- ✅ All admin actions are logged
- ✅ Experimental features gated by `ENABLE_EXPERIMENTAL` or admin status

## 🔧 Configuration

### Environment Variables

**Required in all environments:**
- `API_ENV` - Set to `dev`, `staging`, or `production`
- `ENABLE_EXPERIMENTAL` - Set to `true` or `false`
- `ADMIN_USER_ID` - (Optional) User ID that should have admin access

**Example `.env.development`:**
```
NODE_ENV=development
API_ENV=dev
ENABLE_EXPERIMENTAL=true
ADMIN_USER_ID=your-admin-user-id
```

### Feature Flags

Edit `apps/web/src/config/featureFlags.ts` to enable/disable features:

```typescript
export const featureFlags: Record<FeatureFlag, boolean> = {
  timelinePlayback: false,
  memoryClusters: false,
  characterGraph: false,
  adminConsole: true,
  devDiagnostics: true,
};
```

## 🚀 Usage

### Development Mode
```bash
# Start both web and server
pnpm dev

# Or separately
pnpm dev:web
pnpm dev:server
```

### Staging Mode
```bash
API_ENV=staging pnpm staging
```

### Production Mode
```bash
API_ENV=production pnpm prod
```

### Accessing Consoles

**Admin Console:**
- Navigate to `/admin`
- Requires user role: `admin` or `developer`

**Dev Console:**
- Navigate to `/dev-console`
- Requires: `API_ENV === 'dev'` OR user role: `admin` or `developer`

## 📝 Notes

- All new code is modular and behind feature flags
- Admin actions are logged for audit purposes
- Dev console is completely hidden in production unless user is admin
- Feature flags can be toggled in dev mode via the dev console
- Environment-specific `.env` files are loaded automatically based on `API_ENV`

## 🔒 Security

- Admin routes require authentication + admin role
- Dev routes require authentication + dev access check
- All admin actions are logged
- Production safety: Dev console routes are blocked unless user is admin
- Experimental features are gated by `ENABLE_EXPERIMENTAL` or admin status

