# CLAUDE.md

> Claude Code entry point for this repo. The canonical agent brief is
> **[AGENTS.md](./AGENTS.md)** — read that first. This file adds a few
> Claude-specific tips.

## TL;DR for Claude Code

**Cafe Cursor** — Next.js 16 + SQLite (Drizzle + better-sqlite3) +
iron-session auth. Event registration + Cursor credit distribution for
community meetups. One deployment per city, built for the
[Cursor Ambassador Community](https://cursor.com/ambassadors).

**Don't re-add Supabase.** It was deliberately removed; the DB is now SQLite.
See `AGENTS.md` for the full list of don'ts.

## Fast orientation

```bash
# See the shape of the codebase:
find src -type d -maxdepth 3

# Most important files when starting a new task:
cat AGENTS.md                    # conventions + don'ts
cat src/lib/db/schema.ts         # all data shapes live here
cat src/proxy.ts                 # auth gate for /admin and /onboarding
cat src/lib/auth/guard.ts        # requireUser() used by every admin route
```

## Running things

```bash
npm run init         # first-time setup: generates .env.local + creates DB
npm run dev          # start the dev server
npm run build        # verify changes compile
npm run db:push      # after editing src/lib/db/schema.ts
npm run db:studio    # visual DB browser at localhost:4983
```

When you modify the schema, **always** run `npm run db:push` before
`npm run build` — otherwise queries against the new columns will fail at
collect-page-data.

## Common tasks — where to look

| You want to… | Start here |
|---|---|
| Add an admin page | `src/app/admin/*/page.tsx`, add to `src/components/admin/sidebar.tsx` |
| Add an API route | `src/app/api/admin/*/route.ts`, wrap with `requireUser()` |
| Change the DB | `src/lib/db/schema.ts` → `npm run db:push` |
| Add a new API-key setting | See the masking pattern in `src/app/api/admin/settings/route.ts` + `SecretField` in `src/app/admin/settings/page.tsx` |
| Change the design tokens | `src/app/globals.css` (`:root` and `.dark` blocks) |
| Add a public page | Use `<PublicShell>` from `src/components/public/shell.tsx` |
| Send email | `src/lib/emails/send-coupon-email.ts` — copy the shape |
| Touch Luma | `src/lib/luma/client.ts` + `src/lib/luma/sync.ts` |

## Aesthetic cheat sheet

Cursor-inspired. **Dark-by-default but dual-themed**, warm cream in light
mode. Flat surfaces, no shadows, subtle 1px borders, **pill buttons**.

Type classes: `font-display` (tight Inter), `font-tagline` (Fraunces
italic), `font-code` (JetBrains Mono). Accent tokens:
`var(--brand-orange)`, `var(--brand-green)` with `-soft` variants for
backgrounds.

## Before finishing a task

1. `npm run build` — must pass.
2. `npm run lint` — must be clean.
3. Diff review: are there any `@supabase`, `createAdminClient`,
   `@/types/database`, or mock references? If so, you drifted. Revert.
4. No new multi-paragraph doc comments. Terse, one-liner comments only where
   the *why* is non-obvious.
5. If you added a new env var, add it to `env.example` AND
   `scripts/setup.mjs`.
6. If you added a user-visible feature, add the nav entry in `sidebar.tsx`
   and mention it in `README.md`'s Routes table.

## Style expectations from the repo

Following the global CLAUDE.md preferences that shaped this repo:
- **Be terse.** One-sentence answers when possible.
- **Commit to a take.** "It depends" is a cop-out here. If two approaches
  are viable, pick one and say why.
- **Strong opinions, cheaply held.** Flag dumb requests; don't sugarcoat.
- **No trailing summaries** — the diff speaks for itself.
