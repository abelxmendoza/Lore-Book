# Production Security Configuration

This document outlines the security measures in place for production deployments.

## Protected Features

### Admin Console (`/admin`)
- **Production**: Only accessible to authenticated users with admin role
- **Development**: Accessible for testing
- **Protection**: Route-level and component-level checks
- **Fallback**: Shows 404 page if unauthorized (prevents route discovery)

### Dev Console (`/dev-console`)
- **Production**: COMPLETELY DISABLED (even for admins)
- **Development**: Accessible when `API_ENV === 'dev'` or user is admin
- **Protection**: Route removed from production builds
- **Fallback**: Shows 404 page if accessed in production

### Dev Mode Panel
- **Production**: Completely hidden from UI
- **Development**: Toggleable via sidebar button
- **Protection**: Conditional rendering based on environment

### Dev Mode Button
- **Production**: Hidden from sidebar
- **Development**: Visible in sidebar
- **Protection**: Conditional rendering

## Access Control

### Role-Based Access Control (RBAC)

**Admin Access:**
- Requires `user.user_metadata.role === 'admin'` OR
- Requires `user.user_metadata.role === 'developer'` OR
- Requires `user.app_metadata.role === 'admin'` OR
- Requires `user.app_metadata.role === 'developer'` OR
- Requires `user.id === VITE_ADMIN_USER_ID` (if set)

**Dev Console Access:**
- **Production**: Always denied
- **Development**: Requires `API_ENV === 'dev'` OR admin role

### Route Protection

All sensitive routes are protected at multiple levels:

1. **Router Level**: Routes conditionally included based on environment
2. **Component Level**: Access checks before rendering
3. **API Level**: Backend should also validate admin access

## Production Behavior

### What's Hidden in Production

✅ Dev Console route (`/dev-console`) - Completely removed  
✅ Dev Mode button - Hidden from sidebar  
✅ Dev Mode panel - Not rendered  
✅ Dev diagnostics - Disabled  
✅ Admin console - Only for authenticated admins  

### What's Available in Production

✅ Admin Console (`/admin`) - For authenticated admins only  
✅ All user-facing features - Fully accessible  
✅ Mock data - Enabled for frontend demo  
✅ Development notice - Shown to users  

## Security Best Practices

1. **Never expose admin routes in production without authentication**
2. **Always validate admin access on both frontend and backend**
3. **Use 404 pages instead of null returns to prevent route discovery**
4. **Remove dev tools completely from production builds**
5. **Validate user roles on every sensitive action**

## Configuration

### Environment Variables

**Required for Admin Access:**
- `VITE_ADMIN_USER_ID` - (Optional) Specific user ID with admin access

**For Development:**
- `VITE_API_ENV=dev` - Enables dev console access

### Feature Flags

Feature flags automatically disable sensitive features in production:
- `adminConsole`: `false` in production
- `devDiagnostics`: `false` in production

## Testing Security

### Verify Production Security

1. Build for production:
   ```bash
   npm run build
   ```

2. Check that:
   - Dev console route doesn't exist
   - Dev mode button is hidden
   - Admin console requires authentication
   - Unauthorized access shows 404

3. Test as non-admin user:
   - `/admin` should redirect or show 404
   - `/dev-console` should show 404
   - No dev tools visible in UI

## Notes

- All security checks happen at build time and runtime
- Production builds automatically exclude dev code
- Admin access is strictly enforced in production
- Dev console is completely removed from production builds

