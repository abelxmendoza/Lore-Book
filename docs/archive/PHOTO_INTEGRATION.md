# Photo Gallery Integration Guide

## Overview

Lore Keeper now supports iPhone photo gallery integration with automatic journal entry generation from photo metadata. The system extracts location, date, camera info, and can detect people to create rich journal entries automatically.

## Features

### 📸 Photo Upload & Processing
- Upload single or multiple photos via web interface
- Automatic EXIF metadata extraction (location, date, camera info)
- Reverse geocoding to get location names
- AI-powered journal entry generation from photo metadata

### 📱 Mobile App (React Native)
- Access to device photo gallery
- Batch photo sync
- Native camera integration
- Location and metadata extraction

### 🤖 Auto-Generated Entries
- GPT-4 generates natural journal entries from photo metadata
- Includes location, date, people, and context
- Automatic tagging based on location and content
- Links photos to journal entries

## Setup Instructions

### 1. Backend Setup

#### Install Dependencies
```bash
cd apps/server
pnpm install
```

#### Create Supabase Storage Bucket
1. Go to Supabase Dashboard → Storage
2. Create a new bucket named `photos`
3. Set it to **Public** (or configure RLS policies)
4. Grant service role access

#### Environment Variables
Ensure your `.env` has:
```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
```

### 2. Web App Setup

The PhotoGallery component is already integrated into the main app. Just upload photos and they'll automatically generate journal entries!

### 3. Mobile App Setup (iOS/Android)

#### Install Expo CLI
```bash
npm install -g expo-cli
```

#### Setup Mobile App
```bash
cd apps/mobile
npm install
```

#### Configure Environment
Create `apps/mobile/.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

#### Run on iOS
```bash
npm run ios
```

#### Run on Android
```bash
npm run android
```

## API Endpoints

### Upload Photo
```bash
POST /api/photos/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body: { photo: File }
```

### Upload Multiple Photos
```bash
POST /api/photos/upload/batch
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body: { photos: File[] }
```

### Get User Photos
```bash
GET /api/photos
Authorization: Bearer <token>
```

### Sync Photos (Mobile)
```bash
POST /api/photos/sync
Content-Type: application/json
Authorization: Bearer <token>

Body: {
  photos: [{
    url: string,
    metadata: {
      latitude?: number,
      longitude?: number,
      dateTime?: string,
      cameraMake?: string,
      cameraModel?: string,
      people?: string[]
    }
  }]
}
```

## How It Works

1. **Photo Upload**: User uploads photo(s) via web or mobile app
2. **Metadata Extraction**: System extracts EXIF data (location, date, camera info)
3. **Reverse Geocoding**: Coordinates are converted to location names
4. **AI Generation**: GPT-4 creates a natural journal entry from metadata
5. **Auto-Save**: Entry is automatically saved with photo URL and metadata
6. **Tagging**: Tags are generated from location and content

## Photo Metadata Structure

```typescript
{
  latitude?: number;        // GPS latitude
  longitude?: number;       // GPS longitude
  altitude?: number;        // GPS altitude
  dateTime?: string;        // Photo timestamp
  dateTimeOriginal?: string; // Original photo date
  cameraMake?: string;      // Camera manufacturer
  cameraModel?: string;     // Camera model
  width?: number;          // Photo width
  height?: number;         // Photo height
  orientation?: number;    // EXIF orientation
  people?: string[];       // Detected faces/people
  locationName?: string;   // Reverse geocoded location
}
```

## Example Auto-Generated Entry

**Photo Metadata:**
- Location: San Francisco, CA
- Date: 2024-01-15 14:30
- People: ["Sarah", "Mike"]

**Generated Entry:**
> "Spent the afternoon in San Francisco with Sarah and Mike. Beautiful day exploring the city together. Great memories captured in this moment."

**Auto Tags:** `photo`, `location`, `san-francisco`, `people`, `with-others`

## Permissions Required

### iOS (Info.plist)
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>We need access to your photos to create journal entries</string>
<key>NSCameraUsageDescription</key>
<string>We need camera access to capture photos for your journal</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need location to add context to your journal entries</string>
```

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

## Troubleshooting

### Photos not uploading
- Check Supabase Storage bucket exists and is public
- Verify service role key is set correctly
- Check file size limits (default: 10MB)

### Metadata not extracting
- Ensure photos have EXIF data enabled
- Check location permissions are granted
- Verify reverse geocoding service is accessible

### Auto-entries not generating
- Verify OpenAI API key is set
- Check API quota/limits
- Review server logs for errors

## Future Enhancements

- [ ] Face recognition for people detection
- [ ] Object detection (food, activities, etc.)
- [ ] Photo clustering by location/time
- [ ] Automatic chapter creation from photo groups
- [ ] Photo search by location/date/people
- [ ] Integration with Apple Photos app
- [ ] Background sync for new photos

