# ChatGPT Lore Migration

## Purpose

ChatGPT Lore Migration turns a user-provided ChatGPT data export into reviewable
LoreBook proposals. It does not connect to, scrape, or silently read a ChatGPT
account.

Entry point: **Account → Data & Export → Import My ChatGPT Lore**.

## Trust model

- User-authored messages are autobiographical evidence.
- Assistant messages are inventoried but excluded from autobiographical authority.
- Likely prompts, role-play, fiction, code/debugging requests, and hypotheticals are
  excluded before proposal creation.
- Sensitive claims are excluded unless the user explicitly opts in.
- Every extracted claim is forced into the Memory Review Queue. Import jobs never
  auto-approve memories.
- Approval retains the `USER` authority and source conversation/message provenance.
- Existing MRQ fingerprinting merges repeated beliefs rather than creating duplicate
  approval cards.
- Approved claims use the normal comprehensive ingestion path, which performs entity
  resolution and updates downstream LoreBook projections.

## Supported inputs

- The ZIP produced by ChatGPT data export.
- `conversations.json`.
- Numbered `conversations-N.json` files inside the export ZIP.

The parser follows each conversation's active branch using `current_node`; abandoned
alternate assistant branches are not imported.

## Import flow

1. Upload and inventory the private archive.
2. Review conversation/message counts and the date range.
3. Filter by conversation title and date.
4. Select or clear individual conversations.
5. Choose whether sensitive topics can be proposed.
6. Choose whether to delete the private source archive after extraction.
7. Process selected conversations in resumable batches.
8. Review the category preview.
9. Open Memory Review and approve, reject, or defer individual beliefs.

## Storage and replay behavior

- `user_files` stores the private archive, SHA-256 checksum, inventory, job cursor,
  accumulated counts, and source deletion state.
- The checksum makes uploading the same export replay-safe.
- Processing uses a stable configuration hash. Repeating the same selection resumes
  at the stored cursor.
- If an archive was deleted and the user intentionally uploads the same file again,
  the private source object is restored while retaining the original import record.
- Deleting the source archive removes the binary. Review proposals retain only their
  bounded evidence excerpts and provenance identifiers.

## Personal-account handoff

When the user's OpenAI export email arrives:

1. Download the ZIP before its link expires.
2. Do not extract or commit it into the repository.
3. Sign into the user's LoreBook account.
4. Open **Account → Data & Export → Import My ChatGPT Lore**.
5. Upload the ZIP, inspect the inventory, and start with a narrow date/topic selection
   if the archive is very large.
6. Review the generated proposals before approving any profile changes.
7. Confirm the source archive deletion indicator if that option was selected.

## Deliberate first-release boundaries

- No automatic ChatGPT account connection.
- No periodic synchronization.
- No import of custom instructions, ChatGPT Memory settings, GPT definitions, or
  account settings.
- Attachments referenced by conversations are not ingested in this release.
- Extraction prioritizes explicit autobiographical statements. A later quality pass
  can add a bounded AI extractor for nuanced narrative patterns while preserving the
  same authority and review gates.
