# My Cloud storage architecture

## Current backend
- Supabase Auth: identities and sessions.
- Supabase Postgres: metadata, folders, albums, favorites, trash, shares, upload reservations.
- Supabase Storage: private `user-files` bucket.
- TUS resumable uploads: large-file transfer with retry and browser resume.

Supabase documents TUS as the recommended path for files over 6 MB and recommends the direct storage hostname for large uploads.

## Real 1 TB-per-user launch
The 1 TB value is a quota policy. It is not a free 1 TB allocation from Supabase.

Current Supabase pricing includes 100 GB Storage on Pro, with storage above the included quota billed per GB. A 1 TB-per-user service therefore needs a funded storage budget or a different S3-compatible storage backend.

## Future provider swap
Keep the Postgres `storage_path` and file metadata stable. Replace only the upload/download/share implementation with an S3-compatible adapter when the production storage provider is selected.

Do not put S3 credentials, Supabase secret keys, or service-role keys in the browser.
