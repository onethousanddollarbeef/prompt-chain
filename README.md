# Humor Flavor Prompt Chain Tool

This project is a Next.js + Supabase admin tool for managing humor flavors and ordered humor flavor steps, then testing them against `api.almostcrackd.ai`.

## Implemented requirements

- Admin gate in UI: only users with `profiles.is_superadmin = true` or `profiles.is_matrix_admin = true` can access the tool.
- CRUD for humor flavors.
- CRUD for humor flavor steps.
- Step reordering (move up/down).
- Store and review generated caption runs for each flavor.
- Light / dark / system theme mode.
- API test harness that calls Assignment 5 REST API.
- Explicit Google login/logout controls in UI (no silent auto-deny in incognito).

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ALMOSTCRACKD_API_URL` (default: `https://api.almostcrackd.ai`)
- `ALMOSTCRACKD_API_KEY` (optional unless your API requires auth)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the SQL in `supabase/schema.sql` in your Supabase SQL editor.

3. Start app:

   ```bash
   npm run dev
   ```

## Create GitHub + Vercel project (manual)

I cannot access your GitHub/Vercel accounts directly from this environment, so do this once:

1. Create a new GitHub repo and push this code.
2. Import the repo into Vercel and set the environment variables above.
3. In Vercel project settings, disable **Deployment Protection** so Incognito mode works.
4. Deploy and collect commit-specific URLs for submission.

## What I still need from you

- Confirm exact Assignment 5 endpoint path if it differs from `/captions/generate`.
- Provide Supabase project credentials and (if required) an AlmostCrackd API key.
- Confirm where image test set URLs are stored (if you want a picker rather than manual URL input).
