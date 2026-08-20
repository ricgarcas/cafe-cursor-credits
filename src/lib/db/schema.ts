import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

/**
 * Admin users. Self-registered via /admin-register with a secret phrase.
 * Passwords are bcrypt-hashed. Session is an iron-session cookie (no DB rows).
 */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'host'] }).notNull().default('admin'),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: text('reset_token_expires_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_unique').on(t.email),
  }),
)

/**
 * OAuth 2.1 clients. Cursor self-registers via RFC 7591 dynamic client
 * registration (public, no secret, PKCE). Confidential clients — created by an
 * admin in Settings — carry a hashed secret and use the client_credentials
 * grant for CI and cron, which have no browser to complete an auth code flow.
 */
export const oauthClients = sqliteTable(
  'oauth_clients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash'),
    name: text('name').notNull(),
    redirectUris: text('redirect_uris').notNull().default('[]'),
    grantTypes: text('grant_types').notNull().default('authorization_code,refresh_token'),
    scope: text('scope').notNull().default('cafecursor:read'),
    /** Confidential clients are admin-made; public ones arrive via open DCR. */
    isConfidential: integer('is_confidential', { mode: 'boolean' }).notNull().default(false),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    clientIdIdx: uniqueIndex('oauth_clients_client_id_unique').on(t.clientId),
  }),
)

/**
 * Authorization codes. Single-use, 60s TTL, always PKCE-bound. `resource` is
 * carried through from the authorize request so the minted token can be
 * audience-bound to it (RFC 8707).
 */
export const oauthAuthCodes = sqliteTable(
  'oauth_auth_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    resource: text('resource'),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    codeHashIdx: uniqueIndex('oauth_auth_codes_hash_unique').on(t.codeHash),
  }),
)

/**
 * Access and refresh tokens. Opaque random strings stored only as SHA-256
 * hashes, the same shape as users.resetTokenHash.
 *
 * `audience` is the canonical MCP URI the token was minted for. The resource
 * server MUST reject a token whose audience is not itself — that is the
 * confused-deputy defence, and the loudest MUST in the MCP auth spec.
 *
 * `familyId` ties an access/refresh pair to its grant so that replaying a
 * rotated refresh token can revoke the entire family.
 */
export const oauthTokens = sqliteTable(
  'oauth_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tokenHash: text('token_hash').notNull(),
    type: text('type', { enum: ['access', 'refresh'] }).notNull(),
    familyId: text('family_id').notNull(),
    clientId: text('client_id').notNull(),
    /** Null for client_credentials tokens, which act as the app, not a person. */
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    audience: text('audience').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('oauth_tokens_hash_unique').on(t.tokenHash),
    familyIdx: index('oauth_tokens_family_idx').on(t.familyId),
  }),
)

export type OAuthClient = typeof oauthClients.$inferSelect
export type NewOAuthClient = typeof oauthClients.$inferInsert
export type OAuthAuthCode = typeof oauthAuthCodes.$inferSelect
export type OAuthToken = typeof oauthTokens.$inferSelect
export type NewOAuthToken = typeof oauthTokens.$inferInsert

/**
 * Inventory of Cursor credit codes the organizer has been given. Each code is
 * assigned to at most one attendee (or Luma guest) and marked used once handed out.
 */
export const couponCodes = sqliteTable(
  'coupon_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    isUsed: integer('is_used', { mode: 'boolean' }).notNull().default(false),
    usedAt: text('used_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    codeIdx: uniqueIndex('coupon_codes_code_unique').on(t.code),
    isUsedIdx: index('coupon_codes_is_used_idx').on(t.isUsed),
  }),
)

/**
 * People (city-level, permanent). One row per email — participation in any
 * given event lives in `event_attendees`, not here.
 */
export const attendees = sqliteTable(
  'attendees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    emailIdx: uniqueIndex('attendees_email_unique').on(t.email),
  }),
)

/**
 * Singleton row (enforced by app logic). Holds city identity, branding,
 * onboarding flag, and integration API keys.
 */
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cityName: text('city_name').notNull().default('Cafe Cursor'),
  country: text('country'),
  timezone: text('timezone').notNull().default('America/Mexico_City'),
  language: text('language').notNull().default('en'),
  brandAccent: text('brand_accent', { enum: ['orange', 'green', 'violet', 'blue'] })
    .notNull()
    .default('orange'),
  eventTagline: text('event_tagline'),
  onboarded: integer('onboarded', { mode: 'boolean' }).notNull().default(false),

  // Public /claim self-service portal. When off, the page shows a closed
  // state and the API rejects claims.
  claimEnabled: integer('claim_enabled', { mode: 'boolean' }).notNull().default(true),
  checklistDismissed: integer('checklist_dismissed', { mode: 'boolean' })
    .notNull()
    .default(false),

  // Which email transport to use. 'resend' is the hosted path; 'smtp' is
  // generic SMTP with Gmail presets offered in the UI.
  emailProvider: text('email_provider', { enum: ['resend', 'smtp'] })
    .notNull()
    .default('resend'),

  resendApiKey: text('resend_api_key'),
  fromEmail: text('from_email'),

  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpSecure: integer('smtp_secure', { mode: 'boolean' }).notNull().default(false),
  smtpUser: text('smtp_user'),
  smtpPassword: text('smtp_password'),

  lumaApiKey: text('luma_api_key'),
  lumaCalendarId: text('luma_calendar_id'),

  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

/** Local meetup editions. Exactly one row is 'active' at a time (app-enforced). */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    eventDate: text('event_date'),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('draft'),
    claimPasscode: text('claim_passcode'),
    lumaEventApiId: text('luma_event_api_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    statusIdx: index('events_status_idx').on(t.status),
  }),
)

/** One row per person per event — coupon, check-in, and email state live here. */
export const eventAttendees = sqliteTable(
  'event_attendees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    attendeeId: integer('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['manual', 'luma', 'website'] })
      .notNull()
      .default('website'),
    registeredAt: text('registered_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    couponCodeId: integer('coupon_code_id').references(() => couponCodes.id, {
      onDelete: 'set null',
    }),
    lumaGuestId: text('luma_guest_id'),
    checkedInAt: text('checked_in_at'),
    emailStatus: text('email_status', { enum: ['sent', 'failed', 'skipped'] }),
    emailError: text('email_error'),
    emailSentAt: text('email_sent_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    eventAttendeeIdx: uniqueIndex('event_attendees_event_attendee_unique').on(
      t.eventId,
      t.attendeeId,
    ),
    eventIdx: index('event_attendees_event_idx').on(t.eventId),
    couponIdx: index('event_attendees_coupon_idx').on(t.couponCodeId),
  }),
)

/**
 * Cache of Luma events visible to the configured API key. Refreshed on demand
 * from /admin/luma. `apiId` is Luma's stable identifier (`evt-xxxx`).
 */
export const lumaEvents = sqliteTable(
  'luma_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiId: text('api_id').notNull(),
    name: text('name').notNull(),
    startAt: text('start_at'),
    endAt: text('end_at'),
    timezone: text('timezone'),
    url: text('url'),
    coverUrl: text('cover_url'),
    guestCount: integer('guest_count').notNull().default(0),
    locationName: text('location_name'),
    locationAddress: text('location_address'),
    isSyncEnabled: integer('is_sync_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastSyncedAt: text('last_synced_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    apiIdIdx: uniqueIndex('luma_events_api_id_unique').on(t.apiId),
  }),
)

/**
 * Guests pulled from Luma. Kept separately from `attendees` so we can re-run
 * sync cleanly; when a guest has a coupon + email sent, it's also mirrored
 * into the `attendees` table via `luma_guest_id`.
 */
export const lumaGuests = sqliteTable(
  'luma_guests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiId: text('api_id').notNull(),
    eventApiId: text('event_api_id').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    registrationStatus: text('registration_status', {
      enum: ['confirmed', 'waitlist', 'declined', 'cancelled'],
    }).notNull(),
    approvalStatus: text('approval_status'),
    attendanceStatus: text('attendance_status'),
    registeredAt: text('registered_at'),
    syncedAt: text('synced_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    couponCodeId: integer('coupon_code_id').references(() => couponCodes.id, {
      onDelete: 'set null',
    }),
    emailSentAt: text('email_sent_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    apiIdIdx: uniqueIndex('luma_guests_api_id_unique').on(t.apiId),
    eventIdx: index('luma_guests_event_idx').on(t.eventApiId),
    statusIdx: index('luma_guests_status_idx').on(t.registrationStatus),
  }),
)

export type LumaEvent = typeof lumaEvents.$inferSelect
export type NewLumaEvent = typeof lumaEvents.$inferInsert
export type LumaGuest = typeof lumaGuests.$inferSelect
export type NewLumaGuest = typeof lumaGuests.$inferInsert

// ---------------- Types ----------------
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Attendee = typeof attendees.$inferSelect
export type NewAttendee = typeof attendees.$inferInsert

export type CouponCode = typeof couponCodes.$inferSelect
export type NewCouponCode = typeof couponCodes.$inferInsert

export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type EventAttendee = typeof eventAttendees.$inferSelect
export type NewEventAttendee = typeof eventAttendees.$inferInsert

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, { fields: [eventAttendees.eventId], references: [events.id] }),
  attendee: one(attendees, { fields: [eventAttendees.attendeeId], references: [attendees.id] }),
  couponCode: one(couponCodes, {
    fields: [eventAttendees.couponCodeId],
    references: [couponCodes.id],
  }),
}))
