# Deployment Checklist

This checklist ensures a smooth deployment process for LoreKeeper to production.

## Pre-Deployment

### 1. Environment Variables ✅

**Required Variables:**
- [ ] `VITE_SUPABASE_URL` - Supabase project URL
- [ ] `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- [ ] `VITE_API_URL` - Backend API URL (production)
- [ ] `VITE_SENTRY_DSN` - Sentry error tracking DSN (optional but recommended)
- [ ] `VITE_POSTHOG_KEY` - PostHog analytics key (optional)
- [ ] `VITE_POSTHOG_HOST` - PostHog host URL (optional)

**Backend Variables:**
- [ ] `OPENAI_API_KEY` - OpenAI API key
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `NODE_ENV=production`
- [ ] `PORT` - Server port (default: 4000)

### 2. Database Setup ✅

- [ ] Run all migrations
  ```bash
  # Check migration status
  psql $DATABASE_URL -c "SELECT * FROM schema_migrations;"
  
  # Run pending migrations
  npm run migrate
  ```

- [ ] Verify database indexes are created
- [ ] Set up database backups
- [ ] Configure connection pooling

### 3. Build Verification ✅

**Frontend:**
- [ ] `npm run build` completes without errors
- [ ] Build output in `apps/web/dist/` is valid
- [ ] No TypeScript errors
- [ ] No linting errors (`npm run lint`)
- [ ] Bundle size is acceptable (< 2MB gzipped)

**Backend:**
- [ ] `npm run build` completes without errors
- [ ] TypeScript compilation succeeds
- [ ] No linting errors

### 4. Testing ✅

- [ ] All unit tests pass (`npm run test`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Integration tests pass
- [ ] Test coverage meets threshold (60%+)
- [ ] Manual smoke testing completed

### 5. Security ✅

- [ ] API keys are stored securely (not in code)
- [ ] CORS is configured correctly
- [ ] Rate limiting is enabled
- [ ] Authentication middleware is working
- [ ] Input validation is in place
- [ ] SQL injection prevention verified
- [ ] XSS protection verified
- [ ] HTTPS is enforced

### 6. Performance ✅

- [ ] Code splitting is working
- [ ] Images are optimized
- [ ] API caching is configured
- [ ] Database queries are optimized
- [ ] Bundle size is optimized
- [ ] Lighthouse score > 90

## Deployment Steps

### Frontend (Vercel)

1. **Verify Vercel Configuration:**
   - [ ] Root Directory is set to `apps/web`
   - [ ] Build Command: `npm run build`
   - [ ] Output Directory: `dist`
   - [ ] Install Command: `npm install --legacy-peer-deps`
   - [ ] Node Version: 20.x

2. **Environment Variables:**
   - [ ] All required variables are set in Vercel dashboard
   - [ ] Variables are scoped correctly (Production/Preview/Development)

3. **Deploy:**
   - [ ] Push to main branch triggers deployment
   - [ ] Deployment completes successfully
   - [ ] Build logs show no errors
   - [ ] Preview deployment works

4. **Post-Deployment:**
   - [ ] Verify site is accessible
   - [ ] Check console for errors
   - [ ] Verify API connections
   - [ ] Test authentication flow
   - [ ] Verify analytics tracking

### Backend (Railway/Render/Heroku)

1. **Platform Configuration:**
   - [ ] Node version is set to 20.x
   - [ ] Build command: `npm run build`
   - [ ] Start command: `npm start`
   - [ ] Health check endpoint: `/health`

2. **Environment Variables:**
   - [ ] All required variables are set
   - [ ] Database connection is working
   - [ ] Supabase connection is working
   - [ ] OpenAI API key is valid

3. **Deploy:**
   - [ ] Push to main branch triggers deployment
   - [ ] Build completes successfully
   - [ ] Server starts without errors
   - [ ] Health check returns 200

4. **Post-Deployment:**
   - [ ] API is accessible
   - [ ] `/health` endpoint works
   - [ ] `/api/health` endpoint works
   - [ ] Database connections work
   - [ ] Test API endpoints manually

## Post-Deployment Verification

### 1. Functional Testing ✅

- [ ] User can sign up
- [ ] User can sign in
- [ ] User can create entries
- [ ] User can view timeline
- [ ] User can use chat
- [ ] User can create chapters
- [ ] User can view characters
- [ ] User can access account settings

### 2. Performance Testing ✅

- [ ] Page load time < 3 seconds
- [ ] API response time < 500ms
- [ ] No console errors
- [ ] No network errors
- [ ] Images load correctly
- [ ] Lazy loading works

### 3. Monitoring ✅

- [ ] Error tracking is working (Sentry)
- [ ] Analytics is working (PostHog)
- [ ] Performance monitoring is active
- [ ] Logs are being collected
- [ ] Alerts are configured

### 4. Security Verification ✅

- [ ] HTTPS is enforced
- [ ] Authentication is required for protected routes
- [ ] CORS is configured correctly
- [ ] Rate limiting is active
- [ ] No sensitive data in client code

## Rollback Plan

If deployment fails:

1. **Frontend:**
   - [ ] Revert to previous Vercel deployment
   - [ ] Or rollback git commit and redeploy

2. **Backend:**
   - [ ] Revert to previous deployment
   - [ ] Or rollback git commit and redeploy
   - [ ] Verify database migrations can be rolled back if needed

## Monitoring & Maintenance

### Daily Checks

- [ ] Error rate is acceptable (< 1%)
- [ ] API response times are normal
- [ ] No critical errors in Sentry
- [ ] User signups are working
- [ ] Database is healthy

### Weekly Checks

- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Review user feedback
- [ ] Verify backups are running
- [ ] Check dependency updates

### Monthly Checks

- [ ] Security updates
- [ ] Dependency updates
- [ ] Performance optimization
- [ ] Database optimization
- [ ] Cost review

## Troubleshooting

### Common Issues

1. **Build Fails:**
   - Check Node version
   - Verify dependencies
   - Check build logs
   - Clear build cache

2. **API Not Working:**
   - Verify environment variables
   - Check database connection
   - Verify API keys
   - Check server logs

3. **Authentication Issues:**
   - Verify Supabase configuration
   - Check CORS settings
   - Verify redirect URLs

4. **Performance Issues:**
   - Check bundle size
   - Verify code splitting
   - Check API response times
   - Review database queries

## Support Resources

- **Documentation:** See `README.md` and `docs/` folder
- **Error Tracking:** Sentry dashboard
- **Analytics:** PostHog dashboard
- **Logs:** Platform-specific logging (Vercel/Railway/etc.)
- **Database:** Supabase dashboard

## Notes

- Always test in staging/preview environment first
- Keep deployment logs for troubleshooting
- Document any deployment-specific configurations
- Update this checklist as needed

