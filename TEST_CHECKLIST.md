# Manual Test Checklist — UI + Backend Validation

Use this checklist to confirm the UI updates with input and the backend is working correctly.  
**Test account:** `firefistabel@gmail.com` (magic link or Google sign-in).

---

## Prerequisites

- [ ] Backend running: `npm run dev` (or server on configured port)
- [ ] Frontend running: `apps/web` dev server (e.g. Vite)
- [ ] Logged in as **firefistabel@gmail.com** (no Guest / Demo Mode)
- [ ] Base migrations applied if you use real DB (journal_entries, characters, chapters, etc.)

---

## 1. Journal entry → Timeline

| Step | Action | Verify |
|------|--------|--------|
| 1.1 | Go to **Timeline** (or Entries) and create a new journal entry with a few sentences. Save/submit. | Entry appears in the list immediately. |
| 1.2 | Refresh the page (or open Timeline in a new tab). | Same entry still appears (persisted in backend). |
| 1.3 | Edit the entry (if the UI supports it). Save. | Updated text shows in the list; refresh still shows the update. |

**Backend:** Entry is stored with your `user_id`; GET/PUT use auth and return your data only.

---

## 2. Characters

| Step | Action | Verify |
|------|--------|--------|
| 2.1 | Go to **Characters**. Create a new character (name + optional details). Save. | Character appears in the list. |
| 2.2 | Refresh the page. | Character still there. |
| 2.3 | Open the character and edit (e.g. name or summary). Save. | UI shows the update; refresh persists it. |

**Backend:** Characters CRUD uses `user_id`; no mock data when logged in.

---

## 3. Chapters / Lore Book

| Step | Action | Verify |
|------|--------|--------|
| 3.1 | Go to **Lore Book** (or Chapters). Create a new chapter (title, dates, optional description). Save. | Chapter appears. |
| 3.2 | Refresh. | Chapter still there. |
| 3.3 | Edit the chapter. Save. | Update visible and persisted after refresh. |

**Backend:** Chapters are stored per user; list/detail/edit use real API.

---

## 4. Memoir / Biography

| Step | Action | Verify |
|------|--------|--------|
| 4.1 | Go to **Memoir** (or Biography). Trigger a section generate or load existing. | Content loads or generates without error. |
| 4.2 | If editable, change text and save (or use “Save” if available). | UI shows your change. |
| 4.3 | Refresh or re-open Memoir. | Your content is still there (if the feature persists to backend). |

**Backend:** Memoir/Biography endpoints use auth; data is for the logged-in user.

---

## 5. Chat

| Step | Action | Verify |
|------|--------|--------|
| 5.1 | Open **Chat**. Send a short message. | Your message appears; assistant response streams or appears. |
| 5.2 | Refresh the page. | Conversation still loads (if chat history is persisted). |
| 5.3 | Send another message. | New exchange appears and is stored. |

**Backend:** Chat uses authenticated user; no guest/mock limits when logged in.

---

## 6. Account Center (profile + backend)

| Step | Action | Verify |
|------|--------|--------|
| 6.1 | Go to **Account Center** → Profile. Change **Name** or **Phone**, Save. | Success message; field shows new value. |
| 6.2 | Refresh. | Name/phone still updated (backend persisted). |
| 6.3 | Open **Subscription** / **Billing** (if available). | No mock data: either real data or “No billing history” / empty state. |

**Backend:** Profile and billing use real API for logged-in user; mock only in Demo Mode.

---

## 7. No mock data when logged in

| Check | Expected |
|-------|----------|
| Timeline / entries | Only your entries; no sample/demo entries. |
| Characters | Only characters you created. |
| Billing / subscription | Real data or empty; no fake invoices. |
| Account Center profile | Real name, email, phone from your account. |

If you see obvious demo content (e.g. placeholder invoices, sample characters you didn’t create) while logged in as **firefistabel@gmail.com**, mock is still being used for that path—worth fixing.

---

## Quick reference

- **Test account:** `firefistabel@gmail.com`
- **Auth:** Magic link or Google; stay logged in for all checks above.
- **Backend health:** `GET /api/health` (or your app’s health route) returns 200 when server is up.
- **Frontend env:** Ensure API base URL points at your backend (e.g. `.env` / `VITE_*` for the web app).

---

## After a checklist run

- Note any step where the UI didn’t update or data didn’t persist.
- Check server logs for 4xx/5xx or auth errors on the relevant requests.
- Re-run the failing step after fixing (e.g. migration, env, or code change) to confirm.

Use this checklist whenever you change backend or UI for these flows to ensure **firefistabel@gmail.com** still sees correct, persisted behavior end-to-end.
