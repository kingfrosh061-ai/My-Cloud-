# My Cloud V3 Production Upgrade

This package is the next application layer for My Cloud.

## Included
- Resumable TUS uploads for files larger than 6 MB, with progress and browser-resume support.
- Atomic upload reservations in PostgreSQL to reduce concurrent quota races.
- Full-screen image/video viewer.
- Folder and album management.
- Favorites, trash, restore, permanent delete.
- Share management UI and secure Edge Functions for public share links.
- Password reset request and signed-in password change.
- Account deletion Edge Function.
- Five background themes and mobile-first polish.
- Search and mobile navigation.

## Important infrastructure note
The application quota is 1 TB, but this code does not create 1 TB of free physical storage. Supabase Storage is usage-billed. Supabase's current Pro storage quota is 100 GB, with additional storage billed per GB. For a real 1 TB-per-user public service, choose and fund the storage backend before launch. This V3 uses Supabase Storage as the current backend and is designed so the storage layer can later be replaced with an S3-compatible provider.

## Install
1. Replace `src/main.jsx` and `src/styles.css`.
2. Merge the `package.json` dependency for `tus-js-client` (or replace package.json with this one if it matches your existing Vite project).
3. Run `supabase/schema-v3-production.sql` in Supabase SQL Editor.
4. Deploy the three Edge Functions under `supabase/functions/`.
5. Set Edge Function secrets for the Supabase secret/service key. NEVER put this key in Vite env variables or browser code.
6. Set `MY_CLOUD_APP_URL` to your production Vercel URL for create-share.
7. Test uploads, resume behavior, viewer, shares, password reset, account deletion, and mobile UI before public launch.

## Resumable upload behavior
Supabase recommends TUS resumable uploads for files over 6 MB. The browser uses the direct storage hostname and tus-js-client. The upload URL can remain resumable for up to 24 hours.

## 1 TB reality
The quota value in the UI is an application quota model. Physical capacity is determined by your storage provider and billing plan. Do not advertise 1 TB of free physical storage until the storage contract/budget has been secured.
