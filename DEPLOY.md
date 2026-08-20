# Deploying Cafe Cursor

Three paths. All three work with the same codebase — the only thing that
changes is `DATABASE_URL`.

| Host | DB setup | Button |
|---|---|---|
| **Railway** | SQLite file on persistent volume | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fricgarcas%2Fcafe-cursor-credits) |
| **Vercel + Turso** | Hosted libSQL (free tier) | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fricgarcas%2Fcafe-cursor-credits&env=SESSION_PASSWORD,NEXT_PUBLIC_APP_URL,DATABASE_URL,DATABASE_AUTH_TOKEN) |
| **Fly.io** | SQLite file + optional Litestream | — |

Our DB driver is `@libsql/client`, which speaks both the local file protocol
(`file:./data/app.db`) and Turso's remote libSQL protocol
(`libsql://…turso.io`). Same code, two modes.

---

## 1. Railway · easiest for non-devs

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fricgarcas%2Fcafe-cursor-credits)

### Steps

1. Click the button. Railway will fork the repo into your account.
2. In the service, click **Settings → Volumes → New Volume**, mount at
   `/data` (1 GB is plenty).
3. **Variables** tab — set:
   - `DATABASE_URL=file:/data/app.db` (on the volume, not the ephemeral FS)
   - `SESSION_PASSWORD` — click "Generate" next to the field (or
     paste a 32+ char hex string)
   - `NEXT_PUBLIC_APP_URL` — your Railway public URL once it's provisioned
4. Deploy. On first boot `npm run db:push` creates the tables, and `ensureDefaultSettings`
   seeds the singleton row.
5. Visit the site — it auto-redirects to `/admin-register`. Create the first
   admin account; you're auto-logged in and forwarded to onboarding.

Cost: free tier fits small deployments. ~$5/mo under real load.

---

## 2. Vercel + Turso · one click, serverless

Vercel's filesystem is ephemeral, so the app pairs with
[Turso](https://turso.tech/) — hosted libSQL with a generous free tier. **No
code changes needed.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fricgarcas%2Fcafe-cursor-credits&env=SESSION_PASSWORD,NEXT_PUBLIC_APP_URL,DATABASE_URL,DATABASE_AUTH_TOKEN)

### Create the Turso database first

```bash
# install CLI (macOS)
brew install tursodatabase/tap/turso

turso auth login
turso db create cafe-cursor
turso db show cafe-cursor --url        # → libsql://cafe-cursor-<you>.turso.io
turso db tokens create cafe-cursor      # → eyJ… (auth token)
```

### Then click the Vercel button and paste env vars

| Var | Value |
|---|---|
| `DATABASE_URL` | `libsql://cafe-cursor-<you>.turso.io` |
| `DATABASE_AUTH_TOKEN` | the token from `turso db tokens create` |
| `SESSION_PASSWORD` | 32+ char random — use the "Generate" button or run `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL (`https://your-app.vercel.app`) |

### Apply the schema to Turso

Once deployed, from your laptop:

```bash
DATABASE_URL=libsql://cafe-cursor-<you>.turso.io \
DATABASE_AUTH_TOKEN=<token> \
  npm run db:push
```

That's it. Visit your Vercel URL + `/admin-register` and you're off.

> Turso free tier: 500 databases, 9 GB total storage, 1 billion row reads/mo.
> More than enough for any Cafe Cursor event.

---

## 3. Fly.io · for the SQLite enthusiasts

Fly has first-class support for local SQLite + [Litestream](https://litestream.io/)
(continuous backup to S3). Overkill for a meetup, nice if you want real
durability without Turso.

```bash
fly launch
fly volumes create data --size 1
fly secrets set \
  DATABASE_URL=file:/data/app.db \
  SESSION_PASSWORD=$(openssl rand -hex 32) \
  NEXT_PUBLIC_APP_URL=https://your-app.fly.dev
fly deploy
```

Mount the volume in `fly.toml`:

```toml
[mounts]
source = "data"
destination = "/data"
```

---

## Generating `SESSION_PASSWORD`

Any of these work:

```bash
npm run setup                                                    # writes a generated .env.local
openssl rand -hex 32                                             # macOS / Linux
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # anywhere Node runs
```

## Migrating between modes

Because the driver is the same, you can start on Railway's local volume and
move to Turso later — dump and restore:

```bash
# from Railway shell
sqlite3 /data/app.db .dump > dump.sql

# apply to Turso
turso db shell cafe-cursor < dump.sql

# flip DATABASE_URL (+ set DATABASE_AUTH_TOKEN), redeploy
```

No code changes — that's the whole point of picking libSQL.

### MCP confirm tokens are in-memory

Like the rate limiter, the MCP dry-run/confirm tokens live in process memory.
On a multi-instance deployment a confirm call can land on an instance that
never issued the token, and will be rejected as unknown. Run a single
instance, or move both stores to a shared cache before scaling out.
