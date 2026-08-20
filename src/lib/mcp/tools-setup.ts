import 'server-only'
import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings, couponCodes, events } from '@/lib/db/schema'
import { adoptCityIntoGenericEvents, setActiveEvent } from '@/lib/db/events'
import { suggestEventName } from '@/lib/event-date'
import { canSendEmail, sendAppEmail } from '@/lib/emails/send-coupon-email'
import { consumeConfirmToken, issueConfirmToken } from './confirm-token'
import { text, type ToolServer } from './server-types'

async function settingsRow() {
  await ensureDefaultSettings()
  const [row] = await db.select().from(appSettings).limit(1)
  return row
}

export function registerSetupTools(server: ToolServer, ownerEmail: string) {
  server.registerTool(
    'setup_city',
    {
      title: 'Set city identity',
      description:
        'Set the city identity for this deployment: name, country, timezone, and public tagline. Events still named generically adopt the city automatically.',
      inputSchema: {
        city: z
          .string()
          .min(1)
          .describe('City name, e.g. "Bogota" — do not include "Cafe Cursor"'),
        country: z.string().optional(),
        timezone: z.string().optional().describe('IANA timezone, e.g. America/Bogota'),
        tagline: z.string().optional().describe('Shown on public pages'),
      },
    },
    async (args) => {
      const existing = await settingsRow()
      const [row] = await db
        .update(appSettings)
        .set({
          cityName: args.city,
          ...(args.country !== undefined ? { country: args.country } : {}),
          ...(args.timezone !== undefined ? { timezone: args.timezone } : {}),
          ...(args.tagline !== undefined ? { eventTagline: args.tagline } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appSettings.id, existing.id))
        .returning()
      await adoptCityIntoGenericEvents(row.cityName)
      return text({ city: row.cityName, country: row.country, timezone: row.timezone })
    },
  )

  server.registerTool(
    'create_event',
    {
      title: 'Create an event',
      description:
        'Create a Cafe Cursor edition. Each edition is distinguished by its date, so always set one. Pass activate:true to make it the event public pages bind to.',
      inputSchema: {
        name: z.string().optional().describe('Defaults to "Cafe Cursor <city> — <month>"'),
        date: z.string().optional().describe('YYYY-MM-DD'),
        passcode: z
          .string()
          .max(32)
          .optional()
          .describe('Shown at the venue; blocks remote claims'),
        activate: z.boolean().default(true),
      },
    },
    async (args) => {
      const settings = await settingsRow()
      const name = args.name ?? suggestEventName(settings?.cityName)
      const [row] = await db
        .insert(events)
        .values({ name, eventDate: args.date ?? null, claimPasscode: args.passcode || null })
        .returning()
      if (args.activate) await setActiveEvent(row.id)
      return text({ id: row.id, name: row.name, date: row.eventDate, active: args.activate })
    },
  )

  server.registerTool(
    'add_codes',
    {
      title: 'Import credit codes',
      description:
        'Import Cursor credit codes into the shared pool. Duplicates are skipped. Accepts bare codes or full redeem URLs.',
      inputSchema: { codes: z.array(z.string().min(1)).min(1).max(5000) },
    },
    async ({ codes }) => {
      const clean: string[] = Array.from(
        new Set((codes as string[]).map((c) => c.trim()).filter(Boolean)),
      )
      if (clean.length === 0) return text({ inserted: 0, duplicates: 0, total: 0 })
      const existing = await db
        .select({ code: couponCodes.code })
        .from(couponCodes)
        .where(inArray(couponCodes.code, clean))
      const dupes = new Set(existing.map((r) => r.code))
      const toInsert = clean.filter((c) => !dupes.has(c)).map((code) => ({ code }))
      let inserted = 0
      if (toInsert.length > 0) {
        const rows = await db.insert(couponCodes).values(toInsert).returning({ id: couponCodes.id })
        inserted = rows.length
      }
      return text({ inserted, duplicates: clean.length - inserted, total: clean.length })
    },
  )

  server.registerTool(
    'set_claim_portal',
    {
      title: 'Open or close the claim portal',
      description:
        'Open or close the public /claim portal. Closed means attendees see a notice and cannot claim a code.',
      inputSchema: { enabled: z.boolean() },
    },
    async ({ enabled }) => {
      const existing = await settingsRow()
      await db
        .update(appSettings)
        .set({ claimEnabled: enabled, updatedAt: new Date().toISOString() })
        .where(eq(appSettings.id, existing.id))
      return text({ claim_enabled: enabled })
    },
  )

  server.registerTool(
    'configure_email',
    {
      title: 'Configure email delivery',
      description:
        'Save email provider settings and send a real test message to the API key owner to prove they work. Run with dry_run:true first to see what would change.',
      inputSchema: {
        provider: z.enum(['resend', 'smtp']),
        resend_api_key: z.string().optional(),
        from_email: z.string().email().optional(),
        smtp_host: z.string().optional(),
        smtp_port: z.number().int().positive().max(65535).optional(),
        smtp_user: z.string().optional(),
        smtp_password: z.string().optional(),
        smtp_secure: z.boolean().optional(),
        dry_run: z.boolean().default(true),
        confirm_token: z.string().optional(),
      },
    },
    async (args) => {
      if (args.dry_run) {
        return text({
          would_set_provider: args.provider,
          would_send_test_email_to: ownerEmail,
          confirm_token: issueConfirmToken('configure_email', args),
          note: 'Re-run with dry_run:false and this confirm_token to apply.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'configure_email', args)
      if (!check.ok) {
        return text({
          error: `Confirm token ${check.reason}. Re-run with dry_run:true to get a fresh projection.`,
        })
      }
      const existing = await settingsRow()
      const [row] = await db
        .update(appSettings)
        .set({
          emailProvider: args.provider,
          ...(args.resend_api_key ? { resendApiKey: args.resend_api_key } : {}),
          ...(args.from_email ? { fromEmail: args.from_email } : {}),
          ...(args.smtp_host ? { smtpHost: args.smtp_host } : {}),
          ...(args.smtp_port ? { smtpPort: args.smtp_port } : {}),
          ...(args.smtp_user ? { smtpUser: args.smtp_user } : {}),
          ...(args.smtp_password ? { smtpPassword: args.smtp_password } : {}),
          ...(args.smtp_secure !== undefined ? { smtpSecure: args.smtp_secure } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appSettings.id, existing.id))
        .returning()

      if (!canSendEmail(row)) {
        return text({ saved: true, test_email: 'skipped — configuration is still incomplete' })
      }
      try {
        await sendAppEmail({
          settings: row,
          to: ownerEmail,
          subject: 'Cafe Cursor test email',
          html: '<p>Your email settings work. Attendees will get their credit codes from this sender.</p>',
          fromName: `Cafe Cursor ${row.cityName}`,
        })
        return text({ saved: true, test_email: `sent to ${ownerEmail}` })
      } catch (e) {
        return text({
          saved: true,
          test_email: `FAILED: ${e instanceof Error ? e.message : String(e)}`,
        })
      }
    },
  )
}
