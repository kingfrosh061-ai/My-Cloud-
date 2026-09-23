# My Cloud — React + Supabase setup

## 1. Create the backend
Create a Supabase project. In the Supabase dashboard:
- open SQL Editor
- run `supabase/schema.sql`

This creates:
- user profiles
- private file metadata
- a private `user-files` storage bucket
- per-user Row Level Security policies
- a 1 TB quota field
- a storage-usage function

## 2. Configure Google sign-in
In Supabase Authentication, enable Google and add your Google OAuth credentials.
Set the allowed redirect URL to your deployed My Cloud URL and your local development URL.

## 3. Add environment variables
Copy `.env.example` to `.env.local` and replace the placeholders:

VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

Only use the Supabase browser-safe anon/publishable key here.
NEVER put a service-role/secret key into this React app.

## 4. Run locally
Install Node.js, then:

npm install
npm run dev

## 5. Deploy
This project is Vite/React and can be deployed to Vercel.
Add the same VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values to the Vercel project's Environment Variables.

## Current V1 backend-connected scope
- Google OAuth UI + Supabase auth
- Email/password auth
- Private per-user storage
- Image/video uploads
- 1 TB quota display and upload check
- Storage usage
- Photos/videos filtering
- Trash/restore/permanent deletion
- Signed download links
- Light/dark theme

## Not yet production-complete
- Atomic server-side quota enforcement for concurrent uploads
- Resumable/chunked uploads for very large videos
- Folder CRUD UI and database tables
- Albums UI/tables
- Favorites toggle UI
- Sharing links/permissions
- 30-day automated trash purge
- password reset/verification UX
- abuse/rate limiting
- billing/operational storage plan

These are deliberately the next engineering steps; do not advertise the current build as an unlimited or fully production-hardened cloud service.
