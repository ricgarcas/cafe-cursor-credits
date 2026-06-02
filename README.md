# Cafe Cursor

Event registration + Cursor credit distribution for community meetups. One
deployment per city. Built by and for the
[Cursor Ambassador Community](https://cursor.com/ambassadors) — see also the
[community hub](https://cursor.com/community) and
[Cafe Cursor events on Luma](https://luma.com/cursorcommunity).

Want to bring Cafe Cursor to your city? [Request one here](https://anysphere.typeform.com/to/kyTtNu5Q).

## What it does

**For attendees** — Register at `/register` and get a Cursor credit code by
email, or `/claim` for instant on-screen delivery at the event.

**For ambassadors** — Admin dashboard to manage attendees, code inventory,
print branded QR cards, sync Luma guest lists, and email codes in bulk.

## Screenshots

|  |  |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Attendees](docs/screenshots/attendees.png) |
| **Dashboard** — live KPIs + recent registrations | **Attendees** — search, manage, CSV import |
| ![QR cards](docs/screenshots/qr-cards.png) | ![Register](docs/screenshots/register.png) |
| **QR cards** — printable, one code per card | **Register** — public, dual-themed, dot-grid backdrop |

## Tech stack

- Next.js 16 (App Router, React 19) + TypeScript
- libSQL / SQLite via Drizzle ORM + `@libsql/client` (one driver, local
  file or [Turso](https://turso.tech) remote)
- iron-session cookies + bcryptjs for admin auth
- shadcn/ui + Tailwind CSS v4
- Resend for transactional email
- Luma public API for event guest sync

---

## Quick start — local

Requires Node.js 18+.

```bash
npm install
npm run init       # generates .env.local with random secrets + creates the DB
npm run dev
```

Then open <http://localhost:3000/admin-register>, use the admin phrase
printed by `npm run init` to create the first admin, and you're dropped into
onboarding.

Prefer manual steps? `npm run setup` creates `.env.local`, `npm run db:push`
creates the database tables.

### Try it with demo data

Want to see the dashboard full of attendees and codes without doing the
onboarding by hand?

```bash
npm run db:seed    # 42 attendees, 60 codes, a configured city — and a demo admin
```

It prints demo admin credentials (`admin@cafecursor.dev` / `cafecursor`) —
sign in at `/login`. Re-running it wipes and reseeds the demo data. Never run
it against a real database.

---

## Deploy

One command, three hosts. Full walkthroughs in [`DEPLOY.md`](./DEPLOY.md).

| Host | Button | DB mode |
|---|---|---|
| **Railway** *(recommended for non-devs)* | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fricgarcas%2Fcafe-cursor-credits) | SQLite on persistent volume |
| **Vercel + Turso** | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fricgarcas%2Fcafe-cursor-credits&env=SESSION_PASSWORD,NEXT_PUBLIC_APP_URL,DATABASE_URL,DATABASE_AUTH_TOKEN) | Turso hosted libSQL |
| Fly.io | [See docs](./DEPLOY.md#3-flyio--for-the-sqlite-enthusiasts) | SQLite + Litestream |

After deploy:
1. Open the site — any URL redirects to `/admin-register` until the first
   admin is created.
2. Create the admin account (name + email + password). You're auto-logged in
   and sent to onboarding.
3. Add Cursor credit codes in bulk via **Codes → Bulk add**.
4. Attendees arrive via `/register` (email), `/claim` (on-screen), CSV
   import, or Luma sync.

---

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/register` | Public | Register, code emailed |
| `/claim` | Public | On-site registration, code on screen |
| `/login` | Admin | Sign in |
| `/admin-register` | Public | Self-register as admin (needs the secret phrase) |
| `/onboarding` | Admin | First-run city setup |
| `/admin/dashboard` | Admin | KPIs + recent attendees |
| `/admin/attendees` | Admin | Manage, search, CSV import |
| `/admin/coupons` | Admin | Code inventory, bulk import, edit |
| `/admin/qr-cards` | Admin | Print branded physical cards |
| `/admin/luma` | Admin | Sync Luma events and dispatch credits |
| `/admin/settings` | Admin | City, integrations, API keys |

## Project layout

```
src/
├── app/                 # Pages + API routes
├── components/
│   ├── admin/           # Admin feature components
│   ├── brand/           # Logo, wordmark
│   ├── onboarding/      # Wizard
│   ├── public/          # Public-page shell
│   └── ui/              # shadcn/ui primitives (don't modify)
├── lib/
│   ├── auth/            # iron-session + bcrypt helpers
│   ├── db/              # Drizzle schema + libSQL client
│   ├── emails/          # Resend templates
│   └── luma/            # Luma API client + sync
└── middleware.ts        # Guards /admin and /onboarding
```

## For AI agents

If you're an AI agent (Claude Code, Cursor, Codex, etc.) working on this
repo, start with [AGENTS.md](./AGENTS.md) — it's the canonical brief on
stack, conventions, and what not to do. [CLAUDE.md](./CLAUDE.md) adds a few
Claude-specific tips.

## Credits

Built for the [Cursor Ambassador Community](https://cursor.com/ambassadors).
Cursor is available at [cursor.com](https://cursor.com).

## License

Proprietary — for use by the Cafe Cursor / Cursor Ambassador community.
