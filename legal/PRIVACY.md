# LoreBook Privacy Policy

**Effective date:** June 21, 2026  
**Operator:** Abel Mendoza (Omega Technologies)  
**Website:** [lorebookai.com](https://lorebookai.com)  
**Contact:** [abelxmendoza@gmail.com](mailto:abelxmendoza@gmail.com)

---

## 1. Introduction

This Privacy Policy explains how **LoreBook** ("we," "us," or "the Service") collects, uses, stores, and protects information when you use [lorebookai.com](https://lorebookai.com).

We built LoreBook to help you capture and explore personal lore — not to sell your story. **We do not sell your personal information.**

## 2. Information We Collect

### Account & identity
- Email address and authentication identifiers (Supabase Auth)
- Profile basics you choose to provide
- Subscription status and billing metadata (via Stripe — we do not store full card numbers)

### Content you create
- Chat messages and conversation threads
- Journal entries, chapters, tags, and attachments
- Characters, locations, organizations, timelines, and related lore data
- Files or images you upload to Storage

### Usage & technical data
- Feature usage, request logs, and error diagnostics (to keep the Service reliable)
- Browser/device type, IP address, and approximate region
- Session and security events (sign-in, rate limits, abuse prevention)

### Payment data
Stripe processes payments. We receive subscription status, customer IDs, and billing events — not your full payment card details.

## 3. How We Use Information

We use your information to:

- Provide, maintain, and improve LoreBook
- Authenticate you and enforce row-level security so only you access your data
- Run AI features (embeddings, chat, summaries, entity extraction) on **your** content when you use those features
- Process subscriptions and send service-related communications
- Monitor abuse, debug outages, and protect the platform
- Comply with legal obligations

We **do not** use your journal or chat content for third-party advertising profiles.

## 4. AI Processing

When you use AI features, relevant portions of Your Content are sent to **OpenAI** (or compatible providers we configure) to generate responses and embeddings.

- OpenAI processes data according to their [API data policies](https://openai.com/policies).
- We configure AI calls for Service delivery, not for unrelated model training on your behalf.
- AI output is generated automatically and may be inaccurate — see our [Terms of Service](/api/legal/terms).

## 5. How We Share Information

We **do not sell** personal information. We share data only with:

| Subprocessor | Purpose |
|--------------|---------|
| **Supabase** | Authentication, Postgres database, file storage |
| **OpenAI** | Embeddings, chat completions, structured extraction |
| **Stripe** | Subscription billing and payment processing |
| **Railway** | API hosting (backend infrastructure) |
| **Vercel** | Web app hosting |
| **Sentry** (if enabled) | Error monitoring and performance diagnostics |

These providers process data under their own terms and our instructions, solely to operate LoreBook.

We may also disclose information if required by law, to protect rights and safety, or in connection with a merger or acquisition (with notice where required).

## 6. Storage & Security

- Data is stored in **Supabase** (Postgres + Storage), with **encryption in transit** (TLS).
- **Row-level security (RLS)** restricts database access so authenticated users can only reach their own rows.
- Server-side operations use scoped service credentials; secrets are not exposed to the browser.
- No system is 100% secure. Use a strong, unique sign-in method and report concerns to [abelxmendoza@gmail.com](mailto:abelxmendoza@gmail.com).

## 7. Data Retention

- We retain Your Content while your account is active.
- When you delete your account, we delete associated user data from primary systems. Backups may persist briefly for disaster recovery before being purged.
- Aggregated or de-identified analytics may be retained longer.

## 8. Your Rights & Choices

Depending on where you live, you may have the right to:

| Right | How to exercise |
|-------|-----------------|
| **Access / export** | `GET /api/account/export` (JSON export) or Account settings |
| **Delete** | `POST /api/account/delete` or Account settings — **irreversible** |
| **Correction** | Edit in-app or email us |
| **Opt out of marketing** | We send minimal marketing; unsubscribe links apply when used |
| **Complaint** | Contact your local data protection authority |

California residents may have additional rights under the **CCPA/CPRA**. EU/UK users may have rights under **GDPR**. Contact us to exercise applicable rights.

## 9. Cookies & Local Storage

LoreBook uses browser storage and auth tokens to keep you signed in and remember preferences. We do not use third-party advertising cookies.

## 10. Children

LoreBook is not directed to children under **18**. We do not knowingly collect data from minors. Contact us to request deletion if you believe a minor has registered.

## 11. International Users

LoreBook is operated from the United States. If you access the Service from other regions, your data may be processed in the US and where our subprocessors operate. We take steps consistent with this Policy when transferring data.

## 12. Changes to This Policy

We may update this Policy. Material changes will be posted here with an updated effective date and, when appropriate, notified in-app or by email. Continued use after changes constitutes acceptance.

## 13. Contact

Privacy questions or requests:

**Email:** [abelxmendoza@gmail.com](mailto:abelxmendoza@gmail.com)  
**Web:** [lorebookai.com](https://lorebookai.com)

---

© 2025–2026 Abel Mendoza — Omega Technologies. All rights reserved.
