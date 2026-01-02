# Mock Data Setup for Production UI Demo

This guide explains how to enable mock data in production so you can showcase the UI without a backend.

## Quick Setup

To enable mock data and the development notice in production, add these environment variables in Vercel:

### Required Environment Variables

1. **Enable Mock Data:**
   ```
   VITE_USE_MOCK_DATA=true
   ```

2. **Show Development Notice:**
   ```
   VITE_SHOW_DEV_NOTICE=true
   ```

## What This Does

### Mock Data (`VITE_USE_MOCK_DATA=true`)
- Allows the app to use mock/sample data when the backend is unavailable
- API calls will automatically fall back to mock data instead of showing errors
- Users can explore the full UI with sample data

### Development Notice (`VITE_SHOW_DEV_NOTICE=true`)
- Shows a prominent notice when users first visit the app
- Explains that the app is under development
- Informs users they're seeing demo data
- Can be dismissed and won't show again

## Setting Up in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables for **Production** environment:

   ```
   VITE_USE_MOCK_DATA=true
   VITE_SHOW_DEV_NOTICE=true
   ```

4. Redeploy your application

## What Users Will See

When users visit your app:

1. **First Visit:** A modal notice appears explaining:
   - The app is under development
   - Some features use demo data
   - The UI is fully functional for demonstration
   - They can explore all sections

2. **After Dismissing:** The notice won't appear again (stored in localStorage)

3. **Throughout the App:** 
   - All features work with mock data
   - No backend errors
   - Full UI exploration possible

## Disabling When Backend is Ready

Once your backend is deployed and ready:

1. Remove or set to `false`:
   ```
   VITE_USE_MOCK_DATA=false
   VITE_SHOW_DEV_NOTICE=false
   ```

2. Redeploy

The app will then use real API calls only.

## Local Development

In local development, mock data is automatically enabled. No configuration needed.

## Notes

- Mock data is only used when the backend API is unavailable or returns errors
- If the backend is working, real data will be used even with `VITE_USE_MOCK_DATA=true`
- The development notice respects user preferences (won't show again after dismissal)
- All accessibility features remain enabled regardless of mock data settings

