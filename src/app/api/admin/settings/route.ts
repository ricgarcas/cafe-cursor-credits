import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { maskSecret, isUnchanged } from '@/lib/secrets'

const schema = z.object({
  city_name: z.string().min(1).max(255),
  timezone: z.string().min(1).max(100),
  country: z.string().max(100).nullable().optional(),
  language: z.string().min(2).max(10).optional(),
  brand_accent: z.enum(['orange', 'green', 'violet', 'blue']).optional(),
  event_tagline: z.string().max(255).nullable().optional(),
  onboarded: z.boolean().optional(),
  claim_enabled: z.boolean().optional(),

  // Email provider + credentials.
  email_provider: z.enum(['resend', 'smtp']).optional(),
  resend_api_key: z.string().nullable().optional(),
  from_email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  smtp_host: z.string().max(255).nullable().optional(),
  smtp_port: z.number().int().positive().max(65535).nullable().optional(),
  smtp_secure: z.boolean().optional(),
  smtp_user: z.string().max(255).nullable().optional(),
  smtp_password: z.string().nullable().optional(),

  luma_api_key: z.string().nullable().optional(),
  luma_calendar_id: z.string().max(100).nullable().optional(),
})

function rowToDto(row: typeof appSettings.$inferSelect) {
  return {
    id: row.id,
    city_name: row.cityName,
    country: row.country,
    timezone: row.timezone,
    language: row.language,
    brand_accent: row.brandAccent,
    event_tagline: row.eventTagline,
    onboarded: row.onboarded,
    claim_enabled: row.claimEnabled,

    email_provider: row.emailProvider,
    from_email: row.fromEmail,
    smtp_host: row.smtpHost,
    smtp_port: row.smtpPort,
    smtp_secure: row.smtpSecure,
    smtp_user: row.smtpUser,

    luma_calendar_id: row.lumaCalendarId,
    // Secrets: never send raw values to the browser. Masked preview + boolean.
    resend_api_key: null,
    resend_api_key_masked: maskSecret(row.resendApiKey),
    resend_api_key_set: Boolean(row.resendApiKey),
    smtp_password: null,
    smtp_password_masked: maskSecret(row.smtpPassword),
    smtp_password_set: Boolean(row.smtpPassword),
    luma_api_key: null,
    luma_api_key_masked: maskSecret(row.lumaApiKey),
    luma_api_key_set: Boolean(row.lumaApiKey),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export async function GET() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  await ensureDefaultSettings()
  const [row] = await db.select().from(appSettings).limit(1)
  if (!row) {
    return NextResponse.json({
      id: 0,
      city_name: 'Cafe Cursor',
      timezone: 'America/Mexico_City',
      language: 'en',
      brand_accent: 'orange',
      onboarded: false,
      claim_enabled: true,
      country: null,
      event_tagline: null,
      email_provider: 'resend',
      from_email: null,
      smtp_host: null,
      smtp_port: null,
      smtp_secure: false,
      smtp_user: null,
      smtp_password: null,
      smtp_password_masked: null,
      smtp_password_set: false,
      luma_calendar_id: null,
      resend_api_key: null,
      resend_api_key_masked: null,
      resend_api_key_set: false,
      luma_api_key: null,
      luma_api_key_masked: null,
      luma_api_key_set: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }
  return NextResponse.json(rowToDto(row))
}

export async function PUT(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    )
  }

  await ensureDefaultSettings()
  const [existing] = await db.select().from(appSettings).limit(1)

  const update: Partial<typeof appSettings.$inferInsert> = {
    cityName: parsed.data.city_name,
    timezone: parsed.data.timezone,
    updatedAt: new Date().toISOString(),
  }
  if (parsed.data.country !== undefined) update.country = parsed.data.country
  if (parsed.data.language !== undefined) update.language = parsed.data.language
  if (parsed.data.brand_accent !== undefined) update.brandAccent = parsed.data.brand_accent
  if (parsed.data.event_tagline !== undefined) update.eventTagline = parsed.data.event_tagline
  if (parsed.data.onboarded !== undefined) update.onboarded = parsed.data.onboarded
  if (parsed.data.claim_enabled !== undefined) update.claimEnabled = parsed.data.claim_enabled
  if (parsed.data.from_email !== undefined)
    update.fromEmail = parsed.data.from_email ? parsed.data.from_email : null
  if (parsed.data.email_provider !== undefined) update.emailProvider = parsed.data.email_provider
  if (parsed.data.smtp_host !== undefined) update.smtpHost = parsed.data.smtp_host
  if (parsed.data.smtp_port !== undefined) update.smtpPort = parsed.data.smtp_port
  if (parsed.data.smtp_secure !== undefined) update.smtpSecure = parsed.data.smtp_secure
  if (parsed.data.smtp_user !== undefined) update.smtpUser = parsed.data.smtp_user
  if (parsed.data.luma_calendar_id !== undefined)
    update.lumaCalendarId = parsed.data.luma_calendar_id

  // Secrets: skip updates when the form echoed back the masked value.
  if (parsed.data.resend_api_key !== undefined && !isUnchanged(parsed.data.resend_api_key)) {
    update.resendApiKey = parsed.data.resend_api_key || null
  }
  if (parsed.data.smtp_password !== undefined && !isUnchanged(parsed.data.smtp_password)) {
    update.smtpPassword = parsed.data.smtp_password || null
  }
  if (parsed.data.luma_api_key !== undefined && !isUnchanged(parsed.data.luma_api_key)) {
    update.lumaApiKey = parsed.data.luma_api_key || null
  }

  if (!existing) {
    const [row] = await db.insert(appSettings).values(update).returning()
    return NextResponse.json(rowToDto(row))
  }
  const [row] = await db
    .update(appSettings)
    .set(update)
    .where(eq(appSettings.id, existing.id))
    .returning()
  return NextResponse.json(rowToDto(row))
}
