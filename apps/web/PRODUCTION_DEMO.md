# Production Frontend-Only Demo Configuration

This app is optimized for showcasing the frontend UI without requiring a backend. Mock data and development notices are **enabled by default** in production.

## Current Configuration

### Default Behavior (Production)

✅ **Mock Data**: Enabled by default  
✅ **Development Notice**: Enabled by default  
✅ **Supabase**: Optional (not required for demo)

The app will:
- Use mock data when backend is unavailable
- Show development notice to users on first visit
- Work completely without backend API
- Allow full UI exploration

## How It Works

### Mock Data Fallback

When API calls fail or backend is unavailable:
1. API automatically falls back to mock data
2. No errors shown to users
3. Full UI functionality with sample data
4. Seamless user experience

### Development Notice

Users see a modal on first visit explaining:
- App is under development
- Demo data is being used
- UI is fully functional for exploration
- Can be dismissed (won't show again)

## Disabling for Real Backend

When your backend is ready, you can disable mock data:

### Option 1: Environment Variables (Recommended)

In Vercel Dashboard → Settings → Environment Variables, set:
```
VITE_USE_MOCK_DATA=false
VITE_SHOW_DEV_NOTICE=false
```

### Option 2: Update vercel.json

Remove or set to `false`:
```json
{
  "env": {
    "VITE_USE_MOCK_DATA": "false",
    "VITE_SHOW_DEV_NOTICE": "false"
  }
}
```

## Build Optimization

The production build is optimized for:
- ✅ Fast loading (minified, tree-shaken)
- ✅ No source maps (security)
- ✅ Console.log removed
- ✅ Optimized bundle size
- ✅ Mock data ready

## What Users Experience

1. **First Visit**: Development notice modal
2. **After Dismissal**: Full app access
3. **Throughout App**: All features work with mock data
4. **No Errors**: Graceful fallbacks everywhere

## Testing Locally

```bash
# Development (mock data auto-enabled)
npm run dev

# Production build (mock data enabled by default)
npm run build
npm run preview
```

## Deployment

The app is ready to deploy to Vercel with:
- Mock data enabled
- Development notice enabled
- No backend required
- Full UI functionality

Just deploy and share the URL!

