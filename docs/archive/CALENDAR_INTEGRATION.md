# Calendar Integration Guide

## Overview

Lore Keeper now supports iPhone calendar integration to automatically log calendar events to your journal timeline. Events are processed in the background and create journal entries with location, attendees, and context.

## Features

### 📅 Calendar Event Sync
- Access to all iPhone calendars
- Events from last 30 days and next 30 days
- Automatic journal entry generation from events
- Filters out generic all-day events without context
- Includes location, attendees, notes, and calendar name

### 🤖 Auto-Generated Entries
- GPT-4 generates natural journal entries from calendar events
- Includes event title, location, date/time, attendees
- Automatic tagging based on calendar name and location
- Links calendar events to journal entries

## Setup Instructions

### 1. Mobile App Setup

#### Install Dependencies
```bash
cd apps/mobile
npm install
```

#### iOS Permissions

Add to `app.json` or `Info.plist`:
```json
{
  "ios": {
    "infoPlist": {
      "NSCalendarsUsageDescription": "We need access to your calendar to automatically log events to your journal timeline.",
      "NSCalendarsWriteOnlyUsageDescription": "We need calendar access to sync events with your journal."
    }
  }
}
```

### 2. Backend Setup

The calendar service is already integrated. No additional setup needed!

## API Endpoints

### Sync Calendar Events
```bash
POST /api/calendar/sync
Content-Type: application/json
Authorization: Bearer <token>

Body: {
  events: [{
    id: string,
    title: string,
    startDate: string (ISO),
    endDate?: string (ISO),
    location?: string,
    notes?: string,
    attendees?: string[],
    isAllDay?: boolean,
    calendarName?: string,
    timeZone?: string
  }]
}
```

## How It Works

1. **Calendar Access**: Mobile app requests calendar permissions
2. **Event Loading**: Loads events from last 30 days and next 30 days
3. **Filtering**: Skips generic all-day events without location/notes
4. **Sync**: Sends event metadata to backend
5. **AI Generation**: GPT-4 creates natural journal entries
6. **Auto-Save**: Entries saved with calendar metadata
7. **Timeline**: Events appear in your journal timeline

## Calendar Event Structure

```typescript
{
  id: string;              // Unique event ID
  title: string;           // Event title
  startDate: string;       // ISO date string
  endDate?: string;        // ISO date string (optional)
  location?: string;       // Event location
  notes?: string;          // Event notes/description
  attendees?: string[];    // List of attendee names/emails
  isAllDay?: boolean;      // All-day event flag
  calendarName?: string;   // Source calendar name
  timeZone?: string;       // Timezone
}
```

## Example Auto-Generated Entry

**Calendar Event:**
- Title: "Team Meeting"
- Location: "San Francisco Office"
- Date: 2024-01-15 14:00
- Attendees: ["Sarah", "Mike", "John"]
- Calendar: "Work"

**Generated Entry:**
> "Attended team meeting at San Francisco Office with Sarah, Mike, and John. Discussed project updates and next steps."

**Auto Tags:** `calendar`, `event`, `location`, `san-francisco`, `with-others`, `meeting`, `work`

## Filtering Logic

The system automatically filters out:
- Generic all-day events without location or notes
- Events older than 30 days (unless they have location/context)
- Duplicate events

## Permissions Required

### iOS (Info.plist)
```xml
<key>NSCalendarsUsageDescription</key>
<string>We need access to your calendar to automatically log events to your journal timeline.</string>
```

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.READ_CALENDAR" />
```

## Usage

1. Open the mobile app
2. Grant calendar permissions when prompted
3. Tap "Sync Calendar Events" button
4. Events are processed and journal entries created automatically
5. Check your timeline to see the entries

## Troubleshooting

### Calendar events not loading
- Check calendar permissions are granted
- Verify events exist in your calendars
- Check date range (last 30 days / next 30 days)

### Entries not generating
- Verify OpenAI API key is set
- Check API quota/limits
- Review server logs for errors

### Missing events
- Generic all-day events without context are filtered out
- Only events with location, notes, or attendees are processed
- Check filtering logic in `calendarService.ts`

## Future Enhancements

- [ ] Recurring event handling
- [ ] Event reminders integration
- [ ] Calendar-specific filtering
- [ ] Event updates sync (when events change)
- [ ] Background sync on event creation
- [ ] Integration with Google Calendar, Outlook, etc.

