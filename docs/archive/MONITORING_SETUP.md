# Monitoring Setup Guide

This guide explains how to set up error tracking and analytics for LoreKeeper in production.

## Overview

LoreKeeper uses two monitoring services:
1. **Sentry** - Error tracking and performance monitoring
2. **PostHog** - Product analytics and user behavior tracking

Both services are optional and only activate when API keys are provided.

## Setup Instructions

### 1. Sentry (Error Tracking)

1. **Create a Sentry account** at [sentry.io](https://sentry.io)
2. **Create a new project** (select React as the platform)
3. **Copy your DSN** from the project settings
4. **Add to environment variables:**
   ```bash
   VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```

**Features:**
- Automatic error capture from ErrorBoundary
- Performance monitoring (10% sample rate in production)
- Session replay on errors (100% capture)
- User context tracking
- Source maps for better error debugging

### 2. PostHog (Analytics)

1. **Create a PostHog account** at [posthog.com](https://posthog.com)
2. **Get your API key** from Project Settings → API Keys
3. **Add to environment variables:**
   ```bash
   VITE_POSTHOG_API_KEY=your-api-key
   VITE_POSTHOG_HOST=https://app.posthog.com  # Optional, defaults to this
   ```

**Features:**
- Automatic pageview tracking
- Custom event tracking
- User identification
- Session recording (optional, disabled by default in dev)

### 3. Environment Variables

Add these to your deployment platform (Vercel, Netlify, etc.):

```bash
# Error Tracking (Sentry)
VITE_SENTRY_DSN=your-sentry-dsn

# Analytics (PostHog)
VITE_POSTHOG_API_KEY=your-posthog-key
VITE_POSTHOG_HOST=https://app.posthog.com  # Optional

# Optional: Enable session recording in development
VITE_ENABLE_SESSION_RECORDING=true  # Only if you want recordings in dev
```

### 4. Vercel Setup

If using Vercel, add these in:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add the variables above for Production, Preview, and Development environments

## Configuration

Monitoring is controlled by the `config` object in `apps/web/src/config/env.ts`:

- **Error Reporting**: Enabled in production when `VITE_SENTRY_DSN` is set
- **Analytics**: Enabled in production when `VITE_POSTHOG_API_KEY` is set

Both can be disabled by:
- Not setting the environment variables, OR
- Setting `VITE_ENABLE_ANALYTICS=false` in your environment

## Usage in Code

### Error Tracking

```typescript
import { errorTracking } from './lib/monitoring';

// Capture exceptions
errorTracking.captureException(error, { context: 'additional info' });

// Capture messages
errorTracking.captureMessage('Something happened', 'warning', { data: 'value' });

// Add breadcrumbs
errorTracking.addBreadcrumb({
  message: 'User clicked button',
  category: 'user-action',
  level: 'info',
});
```

### Analytics

```typescript
import { analytics } from './lib/monitoring';

// Track events
analytics.track('button_clicked', { button: 'submit' });

// Track pageviews
analytics.page('Dashboard', { section: 'overview' });

// Identify users (automatically done on login)
analytics.identify(userId, { email, name });
```

### Performance Monitoring

```typescript
import { performance } from './lib/monitoring';

// Measure async operations
const result = await performance.measureAsync('api-call', async () => {
  return await fetchData();
});

// Track API calls (automatically done in fetchJson)
performance.trackApiCall('/api/entries', 150, true);
```

## Privacy & Compliance

- **Error Tracking**: Only captures errors and stack traces, no sensitive user data
- **Analytics**: Tracks user behavior but respects privacy settings
- **Session Replay**: Disabled by default in development, can be enabled per environment
- **User Data**: Only user ID and email are tracked (no passwords or sensitive info)

## Testing

To test monitoring in development:

1. Set the environment variables
2. The services will initialize automatically
3. Check your Sentry/PostHog dashboards for events
4. Trigger an error to test error tracking
5. Navigate pages to test analytics

## Troubleshooting

**Monitoring not working?**
- Check that environment variables are set correctly
- Verify API keys are valid
- Check browser console for initialization messages
- Ensure `config.prod.enableErrorReporting` or `config.prod.enableAnalytics` is true

**Too many errors in Sentry?**
- Adjust `tracesSampleRate` in `monitoring.ts` (currently 10% in production)
- Add filters in `beforeSend` hook to ignore specific errors

**Analytics not tracking?**
- Verify PostHog API key is correct
- Check that `posthog.__loaded` is true (check console)
- Ensure session recording isn't blocking (if enabled)

