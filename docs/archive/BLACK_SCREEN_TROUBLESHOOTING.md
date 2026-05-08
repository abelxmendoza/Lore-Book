# Black Screen Troubleshooting Guide

## Quick Diagnosis

If your deployed site shows a black screen, follow these steps:

### 1. Check Browser Console
Open DevTools (F12) and check the Console tab for errors:
- **CORS errors**: "Access to fetch blocked by CORS policy"
- **Network errors**: Failed API requests
- **JavaScript errors**: Uncaught exceptions
- **Authentication errors**: Token issues

### 2. Check Network Tab
Open DevTools → Network tab:
- Look for failed requests (red status codes)
- Check if API requests are being made
- Verify request headers (Authorization, CORS headers)
- Check response status codes

### 3. Test Diagnostic Endpoint
Visit: `https://your-api-url.com/api/diagnostics`

This will show:
- Server status
- Environment configuration
- CORS settings
- Security configuration

### 4. Test CORS Configuration
Visit: `https://your-api-url.com/api/diagnostics/cors`

This will show:
- Your origin
- Allowed origins
- Whether your origin is allowed

## Common Causes & Fixes

### Cause 1: CORS Blocking Requests
**Symptoms**: Console shows "CORS policy" errors

**Fix**:
1. Set `FRONTEND_URL` environment variable to your frontend domain
2. Or add your domain to the allowed origins list in `apps/server/src/index.ts`
3. Restart the server

**Example**:
```bash
FRONTEND_URL=https://yourdomain.com
```

### Cause 2: Authentication Failing
**Symptoms**: 401 errors in Network tab, "Unauthorized" messages

**Fix**:
1. Verify Supabase is configured correctly
2. Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in frontend
3. Check that `SUPABASE_SERVICE_ROLE_KEY` is set in backend
4. Verify authentication flow works

### Cause 3: Environment Variables Missing
**Symptoms**: API returns 500 errors, "Configuration error" messages

**Fix**:
1. Verify all required environment variables are set:
   - `NODE_ENV=production`
   - `API_ENV=production`
   - `FRONTEND_URL=your-frontend-url`
   - `SUPABASE_URL=your-supabase-url`
   - `SUPABASE_SERVICE_ROLE_KEY=your-key`
   - `OPENAI_API_KEY=your-key`

### Cause 4: Build Issues
**Symptoms**: Blank page, no console errors, no network requests

**Fix**:
1. Check build logs for errors
2. Verify `npm run build` completes successfully
3. Check that `dist/` folder contains built files
4. Verify static file serving is configured

### Cause 5: React Error Boundary Triggered
**Symptoms**: Error message shown instead of black screen (if ErrorBoundary is working)

**Fix**:
1. Check ErrorBoundary component for error details
2. Look at error stack trace
3. Fix the underlying error
4. Check browser console for more details

## Step-by-Step Debugging

### Step 1: Verify Server is Running
```bash
curl https://your-api-url.com/api/diagnostics
```

Should return JSON with server status.

### Step 2: Verify Frontend Can Reach Backend
```bash
# From browser console:
fetch('https://your-api-url.com/api/diagnostics')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

### Step 3: Check Authentication
```bash
# From browser console (after login):
const { data } = await supabase.auth.getSession();
console.log('Session:', data.session ? 'Authenticated' : 'Not authenticated');
```

### Step 4: Test API Call
```bash
# From browser console:
const { data } = await supabase.auth.getSession();
fetch('https://your-api-url.com/api/entries', {
  headers: {
    'Authorization': `Bearer ${data.session?.access_token}`
  }
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

## Environment Variable Checklist

### Frontend (Vercel/Netlify/etc.)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=https://your-api-url.com/api
```

### Backend
```bash
NODE_ENV=production
API_ENV=production
FRONTEND_URL=https://your-frontend-url.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-key
PORT=4000
```

## Security Settings That Might Block Requests

If you just deployed with the new security fixes, check:

1. **CORS**: Is your frontend URL in the allowed list?
2. **Authentication**: Is auth required but tokens not being sent?
3. **CSRF**: Are CSRF tokens being generated and sent?
4. **Rate Limiting**: Are you hitting rate limits?

## Quick Fixes

### Temporarily Disable Security (NOT RECOMMENDED FOR PRODUCTION)
Only for testing/debugging:

```bash
# Backend
DISABLE_AUTH_FOR_DEV=true  # Only if NODE_ENV=development
DISABLE_CSRF=true          # Only for testing
DISABLE_RATE_LIMIT=true    # Only for testing
```

**⚠️ WARNING**: Never use these in production!

### Enable Verbose Logging
```bash
# Backend
LOG_LEVEL=debug
```

This will show detailed logs of all requests and security events.

## Still Having Issues?

1. Check server logs: `logs/security/` directory
2. Check application logs for errors
3. Review `SECURITY_FIXES.md` for security configuration
4. Verify all environment variables are set correctly
5. Test with a simple curl request to verify server is responding

## Contact

If issues persist:
1. Check server logs for specific errors
2. Review browser console for client-side errors
3. Test diagnostic endpoints
4. Verify environment variables are correct
