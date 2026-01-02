# Development vs Production Configuration

This document explains how the app works differently in development vs production modes.

## Overview

The app automatically detects whether it's running in development or production mode and adjusts behavior accordingly. This ensures:

- **Production**: Optimized, secure, and fully functional
- **Development**: Easier to develop with helpful debugging tools and mock data fallbacks

## Environment Detection

The app uses Vite's environment detection:
- **Development**: `import.meta.env.DEV === true` or `import.meta.env.MODE === 'development'`
- **Production**: `import.meta.env.PROD === true` or `import.meta.env.MODE === 'production'`

## Configuration Module

All environment-specific behavior is controlled through `src/config/env.ts`:

```typescript
import { config } from './config/env';

// Check environment
if (config.isDevelopment) {
  // Development-only code
}

// Use configuration
if (config.dev.allowMockData) {
  // Use mock data when backend unavailable
}
```

## Development Features

### Enabled in Development Only

1. **Mock Data Fallback**
   - When backend is unavailable, API calls automatically use mock data
   - Prevents development from being blocked by backend issues
   - Completely disabled in production

2. **Verbose Error Messages**
   - Detailed error information with stack traces
   - Helpful debugging messages
   - Production shows user-friendly messages only

3. **Console Logging**
   - Debug logs, API call logs, performance metrics
   - All console.log statements removed in production builds

4. **Development Banner**
   - Yellow banner in bottom-right corner
   - Indicates app is running in development mode
   - Completely removed from production builds

5. **Performance Metrics**
   - API call timing
   - Component render tracking
   - Function execution time

6. **Debug Overlays**
   - Development tools and diagnostics
   - Component preview and testing

### Development Helpers

Use `src/lib/devHelpers.ts` for development-only utilities:

```typescript
import { dev } from './lib/devHelpers';

// Logging (only in dev)
dev.console.debug('Debug message');
dev.console.performance('Operation', duration);

// Performance monitoring
const result = dev.performance.measure('Operation', () => {
  // Your code
});

// Error details (only in dev)
dev.errors.showDetails(error, 'Context');
```

## Production Features

### Enabled in Production Only

1. **Strict Error Handling**
   - User-friendly error messages
   - No stack traces exposed
   - Error reporting integration ready

2. **Optimized Builds**
   - Minified code
   - No source maps (security)
   - Console.log removed
   - Tree-shaking optimized

3. **API Retry Logic**
   - Automatic retry on failure
   - Better error recovery
   - Longer timeouts for reliability

4. **Analytics** (if configured)
   - User analytics
   - Performance monitoring
   - Error tracking

## Accessibility

**Accessibility features are ALWAYS enabled** in both development and production:

- ARIA labels
- Keyboard navigation
- Screen reader support
- Focus indicators
- Skip links

These are configured in `src/config/env.ts` under `ACCESSIBILITY` and cannot be disabled.

## API Behavior

### Development Mode

- **Timeout**: 30 seconds (longer for debugging)
- **Retry**: Disabled (faster feedback)
- **Mock Data**: Enabled when backend unavailable
- **Error Messages**: Detailed and helpful

### Production Mode

- **Timeout**: 10 seconds (faster user experience)
- **Retry**: Enabled (3 retries for reliability)
- **Mock Data**: Disabled (real API only)
- **Error Messages**: User-friendly

## Building for Production

### Local Production Build

```bash
npm run build
```

This will:
- Validate required environment variables
- Remove all console.log statements
- Minify and optimize code
- Disable source maps
- Remove development features

### Vercel Deployment

Production builds on Vercel automatically:
- Use production mode
- Validate environment variables
- Optimize bundle size
- Remove development code

## Environment Variables

### Required in Production

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

### Optional

- `VITE_API_URL` - Backend API URL (defaults to localhost:4000 in dev)
- `VITE_ALLOW_SKIP_AUTH` - Allow skipping auth in dev (default: false)
- `VITE_ENABLE_ANALYTICS` - Enable analytics in production

## Best Practices

### For Development

1. Use `dev.console.*` instead of `console.log`
2. Use `config.dev.*` to check if feature should be enabled
3. Always provide mock data fallbacks for API calls
4. Use verbose error messages for debugging

### For Production

1. Never use `console.log` directly (use `log` from config)
2. Always handle errors gracefully
3. Never expose stack traces to users
4. Ensure all required environment variables are set

## Testing Both Modes

### Test Development Mode

```bash
npm run dev
```

Check for:
- Development banner visible
- Console logs working
- Mock data fallback working
- Verbose error messages

### Test Production Mode

```bash
npm run build
npm run preview
```

Check for:
- No development banner
- No console.log statements
- No source maps
- Optimized bundle size
- User-friendly error messages

## Troubleshooting

### Development Mode Not Working

- Check `import.meta.env.MODE` is 'development'
- Verify `NODE_ENV` is not set to 'production'
- Check Vite config for mode settings

### Production Build Issues

- Verify all required environment variables are set
- Check for any `console.log` statements (should be removed)
- Ensure source maps are disabled
- Verify minification is enabled

## Security Notes

1. **Source Maps**: Disabled in production to protect source code
2. **Console Logs**: Removed in production to prevent information leakage
3. **Error Details**: Hidden in production to prevent stack trace exposure
4. **Mock Data**: Completely disabled in production

## Summary

- **Development**: Easy to develop, helpful debugging, mock data fallbacks
- **Production**: Optimized, secure, user-friendly, fully functional
- **Accessibility**: Always enabled in both modes
- **Configuration**: Centralized in `src/config/env.ts`

