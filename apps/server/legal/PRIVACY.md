// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

# LoreKeeper Privacy Policy

## Data We Collect
- Account data: email, authentication identifiers, subscription tier.
- Journal content: entries, chapters, tags, attachments, timelines, and character data.
- Usage data: device metadata, event logs, and feature usage to improve reliability.

## How We Use Data
- Provide and personalize the LoreKeeper experience.
- Generate summaries, tasks, and recommendations using AI models.
- Monitor abuse, enforce acceptable use, and improve the product.

## Storage & Security
- Data is stored in Supabase/Postgres and Supabase Storage. Encryption at rest is provided by the cloud provider; optional end-to-end encryption is available for Pro and Founder tiers where configured.
- Access is gated by row-level security (RLS) and scoped tokens.
- Backups and archives follow retention policies; destructive actions are irreversible when you confirm deletion.

## Third-Party Services
- OpenAI (or compatible LLM providers) for embeddings and completions.
- Supabase for authentication, database, and storage.
- Stripe for billing and subscription management.

## Data Sharing
- We do not sell personal data. Sharing occurs only with subprocessors necessary to provide the service.

## Your Rights
- Export: Request a full JSON export via `/api/account/export`.
- Deletion: Request irreversible deletion via `/api/account/delete`.
- Access & Correction: Contact support to review or correct stored data.

## Retention
- Data is retained while your account is active. Backups may persist briefly after deletion for disaster recovery before being purged.

## Changes
- Policy updates will be announced through the app or email. Continued use after updates constitutes acceptance.
