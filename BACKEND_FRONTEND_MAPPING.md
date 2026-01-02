# Backend-Frontend Connection Mapping

## ✅ Connected Endpoints

### Core Features
- **Entries** (`/api/entries`)
  - ✅ GET `/api/entries` - Used by `useLoreKeeper`, `ImprovedTimelineView`
  - ✅ POST `/api/entries` - Used by `useLoreKeeper.createEntry`
  - ✅ GET `/api/entries/:id` - Used by `TimelineEntryModal`
  - ✅ POST `/api/entries/suggest-tags` - Available but not used in frontend
  - ✅ POST `/api/entries/transcribe-voice-memo` - Available but not used in frontend

- **Chapters** (`/api/chapters`)
  - ✅ GET `/api/chapters` - Used by `useLoreKeeper`, `LoreBook`, `ImprovedTimelineView`
  - ✅ POST `/api/chapters` - Used by `useLoreKeeper.createChapter`, `CreateChapterModal`
  - ✅ GET `/api/chapters/candidates` - Available but not used in frontend
  - ✅ GET `/api/chapters/:chapterId` - Available but not used in frontend
  - ✅ POST `/api/chapters/:chapterId/summary` - Used by `ImprovedTimelineView.onSummarizeChapter`

- **Characters** (`/api/characters`)
  - ✅ GET `/api/characters/list` - Used by `CharacterBook`, `UserProfile`, `TimelineEntryModal`, `HQIResultModal`
  - ✅ GET `/api/characters/:id` - Used by `CharacterDetailModal`
  - ✅ POST `/api/characters` - Available but not used in frontend
  - ✅ PATCH `/api/characters/:id` - Used by `CharacterDetailModal`

- **Chat** (`/api/chat`)
  - ✅ POST `/api/chat/stream` - Used by `useChatStream`, `ChatFirstInterface`
  - ✅ POST `/api/chat` - Available as fallback (non-streaming)

- **Memoir** (`/api/memoir`)
  - ✅ GET `/api/memoir/outline` - Used by `MemoirEditor`, `MemoirView`, `LoreBook`, `UserProfile`, `ImprovedTimelineView`
  - ✅ POST `/api/memoir/auto-update` - Used by `MemoirView`
  - ✅ POST `/api/memoir/generate-section` - Used by `MemoirEditor`, `MemoirView`
  - ✅ POST `/api/memoir/generate-full` - Used by `MemoirView`
  - ✅ PATCH `/api/memoir/section` - Used by `MemoirEditor`
  - ✅ POST `/api/memoir/chat-edit` - Used by `MemoirEditor`, `MemoirView`

- **Tasks** (`/api/tasks`)
  - ✅ GET `/api/tasks` - Used by `useTaskEngine`
  - ✅ POST `/api/tasks` - Used by `useTaskEngine.createTask`
  - ✅ POST `/api/tasks/from-chat` - Used by `useTaskEngine.processChat`
  - ✅ GET `/api/tasks/briefing` - Used by `useTaskEngine`
  - ✅ GET `/api/tasks/events` - Used by `useTaskEngine.refreshEvents`
  - ✅ POST `/api/tasks/:id/complete` - Used by `useTaskEngine.completeTask`
  - ✅ DELETE `/api/tasks/:id` - Used by `useTaskEngine.deleteTask`
  - ✅ PATCH `/api/tasks/:id` - Used by `useTaskEngine.updateTask`

- **Timeline** (`/api/timeline`)
  - ✅ GET `/api/timeline` - Used by `useLoreKeeper.refreshTimeline`
  - ✅ GET `/api/timeline/tags` - Used by `useLoreKeeper.refreshTimeline`
  - ✅ POST `/api/timeline/append` - Available but not used in frontend

- **Insights** (`/api/insights`)
  - ✅ GET `/api/insights/recent` - Used by `UserProfile`, `InsightsPanel`
  - ✅ GET `/api/insights/monthly/:year/:month` - Available but not used in frontend
  - ✅ GET `/api/insights/yearly/:year` - Available but not used in frontend
  - ✅ POST `/api/insights/predict` - Available but not used in frontend

- **Identity** (`/api/identity`)
  - ✅ GET `/api/identity/pulse` - Used by `IdentityPulsePanel`
  - ✅ POST `/api/identity/recompute` - Available but not used in frontend

- **Documents** (`/api/documents`)
  - ✅ GET `/api/documents/language-style` - Used by `UserProfile`, `MemoirView`
  - ✅ POST `/api/documents/upload` - Used by `MemoirEditor`, `MemoirView`

- **HQI** (`/api/hqi`)
  - ✅ POST `/api/hqi/search` - Used by `HQIPanel`, `MemoirEditor`
  - ✅ GET `/api/hqi/node/:nodeId/context` - Used by `HQIPanel`

- **Health** (`/health`, `/ready`, `/live`)
  - ✅ GET `/health` - Used by `ChatFirstInterface` (health check)
  - ✅ GET `/ready` - Available for load balancers
  - ✅ GET `/live` - Available for Kubernetes

- **Dev** (`/api/dev`)
  - ✅ POST `/api/dev/populate-dummy-data` - Used by `PopulateDummyData`

- **Naming** (`/api/naming`)
  - ✅ POST `/api/naming/chapter-name` - Used by `ImprovedTimelineView`
  - ✅ POST `/api/naming/memoir` - Used by `MemoirGenerator`

- **Corrections** (`/api/corrections`)
  - ✅ POST `/api/corrections/:entryId` - Used by `App.handleQuickCorrection`

## ⚠️ Partially Connected / Missing Frontend Integration

### Backend Routes Without Frontend Usage

1. **Orchestrator** (`/api/orchestrator`)
   - ✅ GET `/api/orchestrator/summary` - Used by `useLoreOrchestrator`
   - ✅ GET `/api/orchestrator/hqi` - Used by `useLoreOrchestrator.searchHQI`
   - ✅ GET `/api/orchestrator/fabric/:memoryId` - Used by `useLoreOrchestrator.loadFabricNeighbors`
   - ⚠️ Other endpoints may exist but not mapped

2. **Autopilot** (`/api/autopilot`)
   - ✅ GET `/api/autopilot/daily` - Used by `useAutopilot`
   - ✅ GET `/api/autopilot/weekly` - Used by `useAutopilot`
   - ✅ GET `/api/autopilot/monthly` - Used by `useAutopilot`
   - ✅ GET `/api/autopilot/transition` - Used by `useAutopilot`
   - ✅ GET `/api/autopilot/alerts` - Used by `useAutopilot`
   - ✅ GET `/api/autopilot/momentum` - Used by `useAutopilot`

3. **Evolution** (`/api/evolution`)
   - ✅ GET `/api/evolution` - Used by `useLoreKeeper.refreshEvolution`

4. **Summary** (`/api/summary`)
   - ✅ POST `/api/summary/reflect` - Used by `useLoreKeeper.reflect`
   - ⚠️ Other summary endpoints may exist but not mapped

5. **Memory Graph** (`/api/memory-graph`)
   - ⚠️ Endpoints exist but frontend usage unclear

6. **Memory Ladder** (`/api/memory-ladder`)
   - ⚠️ Endpoints exist but frontend usage unclear

7. **Continuity** (`/api/continuity`)
   - ⚠️ Endpoints exist but frontend usage unclear

8. **Canon** (`/api/canon`)
   - ⚠️ Endpoints exist but frontend usage unclear

9. **Ladder** (`/api/ladder`)
   - ⚠️ Endpoints exist but frontend usage unclear

10. **People Places** (`/api/people-places`)
    - ⚠️ Endpoints exist but frontend usage unclear

11. **Locations** (`/api/locations`)
    - ⚠️ Endpoints exist but frontend usage unclear

12. **X (Twitter)** (`/api/x`)
    - ⚠️ Endpoints exist but frontend usage unclear

13. **Photos** (`/api/photos`)
    - ⚠️ Endpoints exist but frontend usage unclear

14. **Calendar** (`/api/calendar`)
    - ⚠️ Endpoints exist but frontend usage unclear

15. **Account** (`/api/account`)
    - ⚠️ Endpoints exist but frontend usage unclear

16. **Onboarding** (`/api/onboarding`)
    - ⚠️ Endpoints exist but frontend usage unclear

17. **Agents** (`/api/agents`)
    - ⚠️ Endpoints exist but frontend usage unclear

18. **Persona** (`/api/persona`)
    - ⚠️ Endpoints exist but frontend usage unclear

19. **Github** (`/api/github`)
    - ⚠️ Endpoints exist but frontend usage unclear

20. **External Hub** (`/api/external-hub`)
    - ⚠️ Endpoints exist but frontend usage unclear

21. **Integrations** (`/api/integrations`)
    - ⚠️ Endpoints exist but frontend usage unclear

22. **Journal** (`/api/journal`)
    - ⚠️ Endpoints exist but frontend usage unclear

23. **Notebook** (`/api/notebook`)
    - ⚠️ Endpoints exist but frontend usage unclear

24. **Harmonization** (`/api/harmonization`)
    - ⚠️ Endpoints exist but frontend usage unclear

25. **Time** (`/api/time`)
    - ⚠️ Endpoints exist but frontend usage unclear

## 🔴 Missing Connections

### Frontend Components Looking for Backend Endpoints

1. **TimelineEntryModal**
   - ✅ GET `/api/entries/:id` - Connected
   - ✅ GET `/api/characters/list` - Connected
   - ⚠️ May need PATCH `/api/entries/:id` for editing entries

2. **CharacterDetailModal**
   - ✅ GET `/api/characters/:id` - Connected
   - ✅ PATCH `/api/characters/:id` - Connected
   - ⚠️ May need relationship endpoints

3. **HQIPanel**
   - ✅ POST `/api/hqi/search` - Connected
   - ✅ GET `/api/hqi/node/:nodeId/context` - Connected

4. **MemoryFabricPanel**
   - ⚠️ Needs `/api/memory-graph` endpoints

5. **ContinuityPanel**
   - ⚠️ Needs `/api/continuity` endpoints

6. **SagaScreen**
   - ⚠️ Needs saga-related endpoints

7. **PhotoGallery**
   - ⚠️ Needs `/api/photos` endpoints

8. **GithubPanel**
   - ⚠️ Needs `/api/github` endpoints

9. **InstagramPanel**
   - ⚠️ Needs Instagram integration endpoints

## 📋 Recommendations

### High Priority
1. **Add Entry Editing**: Implement PATCH `/api/entries/:id` endpoint and connect to `TimelineEntryModal`
2. **Memory Graph Integration**: Connect `MemoryFabricPanel` to `/api/memory-graph` endpoints
3. **Continuity Integration**: Connect `ContinuityPanel` to `/api/continuity` endpoints
4. **Character Relationships**: Add endpoints for character relationships and connect to `CharacterDetailModal`

### Medium Priority
1. **Voice Memo Transcription**: Connect voice memo upload to `/api/entries/transcribe-voice-memo`
2. **Tag Suggestions**: Connect tag suggestions to `/api/entries/suggest-tags`
3. **Chapter Candidates**: Use `/api/chapters/candidates` in timeline view
4. **Monthly/Yearly Insights**: Add UI for monthly and yearly insights

### Low Priority
1. **Photo Gallery**: Connect to `/api/photos` endpoints
2. **Calendar Integration**: Connect to `/api/calendar` endpoints
3. **External Integrations**: Connect various integration panels to their endpoints
4. **Account Management**: Connect account settings to `/api/account` endpoints

## 🔍 Testing Checklist

- [ ] All connected endpoints tested and working
- [ ] Error handling implemented for all API calls
- [ ] Loading states implemented for all async operations
- [ ] Authentication tokens properly passed in all requests
- [ ] CORS configured correctly
- [ ] Rate limiting not blocking legitimate requests

