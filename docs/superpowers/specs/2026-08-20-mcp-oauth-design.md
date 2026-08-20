# MCP OAuth Design

**Status:** approved
**Supersedes the auth section of:** `2026-08-20-mcp-server-design.md`

## The one thing to not get wrong

**cursor.com is not an identity provider here.** There is no "Sign in with
Cursor". Cursor is the OAuth *client*; this app is the OAuth *authorization
server* and the *resource server*.

The credential a user types is their **admin account in this app's `users`
table** — the same email + bcrypt password `/login` already checks. Cursor
never sees it. No external account is consulted. Every issued token is bound
to a `users.id` row in this deployment's own database.

```
Cursor  ->  MCP request, no token
App     ->  401 + WWW-Authenticate: resource_metadata=...
Cursor  ->  discovery, DCR, PKCE, opens browser at THIS app's /oauth/authorize
App     ->  no session? redirect to THIS app's /login?redirect=...
Admin   ->  email + password  (users table, verifyPassword)
App     ->  consent screen: "Cursor wants read + write"
App     ->  authorization code -> access token bound to that users.id
Cursor  ->  /api/mcp with Bearer token
```

## Roles

This deployment is single-tenant and self-hosted per city, and already owns
identity: a `users` table, bcrypt, iron-session, a working login page.
Delegating to an external IdP would add a vendor for nothing. So the app is
both authorization server and resource server.

## Endpoints

| Path | Spec | Notes |
|---|---|---|
| `/.well-known/oauth-protected-resource/api/mcp` | RFC 9728 | `protectedResourceHandler` from `mcp-handler` |
| `/.well-known/oauth-authorization-server` | RFC 8414 | hand-written |
| `/oauth/register` | RFC 7591 | open DCR, gated at consent |
| `/oauth/authorize` | OAuth 2.1 | reuses `/login`, then consent |
| `/oauth/token` | OAuth 2.1 | `authorization_code`, `refresh_token`, `client_credentials` |
| `/oauth/revoke` | RFC 7009 | |

`@modelcontextprotocol/sdk`'s auth handlers are Express-coupled
(`import { RequestHandler } from 'express'`, `express-rate-limit`) and cannot
mount in a Next route handler. The authorization-server half is written by
hand; only the resource-server half comes from `mcp-handler`.

## Scopes

Two, mirroring the tiering already chosen for keys:

- `cafecursor:read` — `readiness_check`, `event_status`, `find_attendee`,
  `export_attendees`
- `cafecursor:write` — `setup_city`, `create_event`, `add_codes`,
  `set_claim_portal`, `configure_email`, `dispatch_codes`, `resend_failed`,
  `sync_luma`, `checkin`

`scopes_supported` lists both. A write tool called with a read-only token gets
**403** + `WWW-Authenticate: Bearer error="insufficient_scope",
scope="cafecursor:write", resource_metadata="..."` so the client can step up.

The dry-run/confirm-token gate is unchanged and independent. Scope says *may
you*; the confirm token says *did a human look at the projection*. A write
scope does not skip the gate.

## Registration

Open DCR. Anyone may POST `/oauth/register`; a client record alone grants
nothing, because `/oauth/authorize` requires an authenticated admin to click
Approve. Unredeemed clients that never complete a grant are pruned after 24h.
This is what makes Cursor's paste-URL-and-click-Connect flow work.

## Client credentials replaces API keys

API keys are removed. `authorization_code` needs a browser, which CI and cron
do not have, so the machine path becomes an OAuth-native
`client_credentials` grant against a confidential client the admin creates in
Settings. Same single auth story; headless still works.

`requireApiKey()` becomes `requireMcpAuth()`. The 13 tools do not change.

## Data

Three tables. **In the database, not in memory** — unlike the confirm-token
store, tokens must survive a restart.

- `oauth_clients` — client_id, hashed secret (confidential only), redirect
  URIs, grant types, scopes, name, created_at, last_used_at
- `oauth_auth_codes` — code hash, client_id, user_id, PKCE challenge, resource,
  scope, expires_at (60s), consumed_at
- `oauth_tokens` — token hash, type, client_id, user_id, scope, **audience**,
  expires_at, revoked_at

Tokens are opaque random strings stored as SHA-256 hashes, matching how
`users.resetTokenHash` already works. Access tokens live 1h, refresh tokens
30d and rotate on use.

## Security requirements

Non-negotiable, from the MCP authorization spec:

1. **Audience binding.** Every token records the `resource` it was minted for.
   `/api/mcp` rejects a token whose audience is not this server's canonical
   URI. This is the confused-deputy defence and the spec's loudest MUST.
2. **PKCE S256 required.** `plain` is rejected. No `code_challenge`, no code.
3. **`iss` in the authorization response** (RFC 9207), with
   `authorization_response_iss_parameter_supported: true` in metadata.
4. **Exact redirect URI matching.** No prefix or wildcard matching.
5. **Single-use codes**, 60-second TTL, consumed atomically.
6. **Refresh token rotation**; reuse of a consumed refresh token revokes the
   whole grant family.
7. Tokens never in query strings. `Authorization: Bearer` only.

## Canonical URI

`${PUBLIC_URL}/api/mcp`, no trailing slash. Derived via `getPublicOrigin`
from `mcp-handler`, which reads `X-Forwarded-Host`/`X-Forwarded-Proto`, with
an explicit `PUBLIC_URL` override for proxies that strip them.

## Proxy interaction

`src/proxy.ts` currently funnels every non-`/api` path to `/admin-register`
when no admin exists. OAuth metadata must stay publicly readable, so
`/.well-known/*` is exempted from the bootstrap funnel. `/oauth/authorize`
handles its own session redirect rather than relying on the proxy gate, so
that an invalid `client_id` returns an OAuth error instead of a login bounce.

## Out of scope

Client ID Metadata Documents (draft), OpenID Connect discovery, multi-tenant
consent, per-tool scopes finer than read/write.
