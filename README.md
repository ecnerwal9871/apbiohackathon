# APBioFocus Web (Next.js + Supabase)

Production-ready scaffold for AP Biology planning and focus tracking.

## What is implemented

- Responsive multi-screen app:
  - Dashboard
  - Curriculum (8 units, 35 chapters)
  - Topic detail (notes/resources/flashcard hook)
  - Study plan calendar
  - Active pomodoro timer
  - Session complete screen
  - Stats/history
  - Settings
- Chapter-based curriculum progress (not unit-only)
- Seasonal daily goals editable in settings
- Lagging / On Track / Ahead shown together with active state highlighted
- Timer controls: start, pause, reset, mode switch
- Focus-only time accounting:
  - Daily totals only count active focus time
  - Break time is excluded
- Streak based on consecutive study days using system date boundaries
- Local persistence in browser storage
- Google login page + Supabase auth integration hooks
- Cloud save/load API via `/api/sync`

## Stack

- Frontend: Next.js (App Router) + TypeScript + Tailwind
- Backend: Supabase (Postgres + Auth)
- Sign-on: Google OAuth through Supabase Auth

## Prerequisites

This machine did not have Node tooling at implementation time (`node`, `npm`, `npx` missing).
Install Node 20+ first, then continue.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

4. In Supabase SQL editor, run:

- `supabase/schema.sql`
- `supabase/seed.sql`

5. In Supabase dashboard:

- Enable Google provider in Auth > Providers
- Set OAuth redirect URL to:
  - `http://localhost:3000/auth/callback`
  - your production URL later

6. Cloud sync endpoint:

- The app sends authenticated bearer tokens to `/api/sync`.
- `/api/sync` stores full state in `user_state` and also writes normalized tables:
  - `user_settings`
  - `user_chapter_progress`
  - `daily_stats`
  - `notes`
  - `study_sessions`

7. Start app:

```bash
npm run dev
```

## Important files

- `src/components/focus-app.tsx` main app logic/UI
- `src/app/api/sync/route.ts` cloud state save/load endpoint
- `src/lib/apbio-data.ts` AP Bio units/chapters data
- `supabase/schema.sql` relational schema + RLS policies
- `supabase/seed.sql` curriculum seed data

## Notes

- `/api/sync` currently stores full client state in `user_state.state_json`.
- You can evolve to normalized table sync using `study_sessions`, `daily_stats`, `user_chapter_progress`, and `notes`.
- RLS policies are included in schema.
