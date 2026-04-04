# Humor Flavor Prompt Chain Tool

This project is a Next.js + Supabase admin tool for managing humor flavors and ordered humor flavor steps, then testing them against `api.almostcrackd.ai`.

## Implemented requirements

- Admin gate in UI: only users with `profiles.is_superadmin = true` or `profiles.is_matrix_admin = true` can access the tool.
- CRUD for humor flavors.
- CRUD for humor flavor steps.
- Step reordering (move up/down).
- Flavor search bar (filter by slug/description).
- Light / dark / system theme mode.
- API test harness that calls Assignment 5 REST API pipeline endpoints.
- Explicit Google login/logout controls in UI (no silent auto-deny in incognito).

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ALMOSTCRACKD_API_KEY` (optional unless your API requires auth)

The server route is hardcoded to `https://api.almostcrackd.ai`, tries both `/pipeline/...` and `/api/pipeline/...` paths automatically, and can fall back to legacy captions endpoints if pipeline routes are unavailable.
When legacy fallback is used, captions may be less faithful to custom humor-flavor steps than pipeline mode.

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

## Notes

- This app does not store generated captions in Supabase. It sends generation requests to `api.almostcrackd.ai`, and the REST API manages caption persistence.

## Merge conflict tip (GitHub UI)

When GitHub asks **Current** vs **Incoming**:

- **Current change** = code already on the base branch (usually `main`).
- **Incoming change** = code from the PR branch you are merging.

For this project, if you want the newest prompt-chain updates from the PR branch, prefer **Incoming change** for `app/page.tsx` and related app files, then verify the final file still contains the deployment marker text.

If unsure, choose **Compare changes** and keep both sections manually where possible.

## Vercel deployment reliability

If Vercel fails with `next: not found`, this repo now includes `vercel.json` to force:

- `installCommand: npm install`
- `buildCommand: npm run build`

and `package.json` includes Node/npm metadata for more consistent installs on Vercel.


### Fix for `Unexpected non-whitespace character after JSON`

If Vercel shows `/vercel/path0/package.json: Unexpected non-whitespace character after JSON`, your `package.json` in that deployed commit is malformed (often from a merge conflict marker).

Run:

```bash
npm run validate:json
```

This repo now includes a GitHub Action that checks JSON syntax on PRs and pushes to prevent this from happening again.


## Security patch note

This project pins Next.js to a patched release (`15.2.6`) to address the React2Shell-related vulnerability range that affected `15.2.x` releases before `15.2.6`.
