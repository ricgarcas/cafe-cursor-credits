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
    usedByType: text('used_by_type', { enum: ['attendee', 'luma_guest'] }),
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
 * Everyone who registers — via /register, /claim, CSV import, or Luma sync.
 * One row per email. Optionally linked to a coupon row.
 */
export const attendees = sqliteTable(
  'attendees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    couponCodeId: integer('coupon_code_id').references(() => couponCodes.id, {
      onDelete: 'set null',
    }),
    source: text('source', { enum: ['manual', 'luma', 'website'] })
      .notNull()
      .default('website'),
    lumaGuestId: text('luma_guest_id'),
    lumaEventId: text('luma_event_id'),
    registeredAt: text('registered_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    emailIdx: uniqueIndex('attendees_email_unique').on(t.email),
    couponIdx: index('attendees_coupon_idx').on(t.couponCodeId),
    lumaGuestIdx: index('attendees_luma_guest_idx').on(t.lumaGuestId),
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
  lumaEventId: text('luma_event_id'),

  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

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

// ---------------- Relations ----------------
export const attendeesRelations = relations(attendees, ({ one }) => ({
  couponCode: one(couponCodes, {
    fields: [attendees.couponCodeId],
    references: [couponCodes.id],
  }),
}))

export const couponCodesRelations = relations(couponCodes, ({ many }) => ({
  attendees: many(attendees),
}))

// ---------------- Types ----------------
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Attendee = typeof attendees.$inferSelect
export type NewAttendee = typeof attendees.$inferInsert

export type CouponCode = typeof couponCodes.$inferSelect
export type NewCouponCode = typeof couponCodes.$inferInsert

export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert

export type AttendeeWithCoupon = Attendee & { couponCode: CouponCode | null }
