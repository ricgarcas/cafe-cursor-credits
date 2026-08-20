import 'server-only'
import { z } from 'zod'
import { and, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, attendees, eventAttendees } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import { syncLumaGuests } from '@/lib/luma/sync'
import { projectDispatch, runDispatch, type DispatchScope } from './dispatch'
import { consumeConfirmToken, issueConfirmToken } from './confirm-token'
import { text, type ToolServer } from './server-types'

const staleToken = (reason: string) =>
  text({ error: `Confirm token ${reason}. Re-run with dry_run:true to get a fresh projection.` })

export function registerOpsTools(server: ToolServer) {
  server.registerTool(
    'dispatch_codes',
    {
      title: 'Assign and email credit codes',
      description:
        'Assign credit codes and email them, in one pass. ALWAYS call with dry_run:true first — the projection shows how many emails would be sent and how many codes would be burned, and returns a confirm_token needed for the real run.',
      inputSchema: {
        scope: z
          .enum(['luma', 'all_unassigned'])
          .default('luma')
          .describe(
            '"luma" covers guests synced from Luma; "all_unassigned" covers everyone in the event without a code',
          ),
        dry_run: z.boolean().default(true),
        confirm_token: z.string().optional(),
      },
    },
    async (args) => {
      if (args.dry_run) {
        const p = await projectDispatch(args.scope as DispatchScope)
        return text({
          would_email: p.wouldEmail,
          would_burn_codes: p.wouldBurn,
          codes_available: p.availableCodes,
          codes_remaining_after: p.remainingAfter,
          shortfall: p.shortfall,
          email_configured: p.emailConfigured,
          confirm_token: issueConfirmToken('dispatch_codes', args),
          note: 'Re-run with dry_run:false and this confirm_token to actually send.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'dispatch_codes', args)
      if (!check.ok) return staleToken(check.reason)
      const r = await runDispatch(args.scope as DispatchScope)
      return text({
        assigned: r.assigned,
        emailed: r.emailed,
        failed: r.failed,
        out_of_codes: r.outOfCodes,
        ...(r.outOfCodes
          ? { warning: 'Ran out of codes — some attendees were not served.' }
          : {}),
      })
    },
  )

  server.registerTool(
    'resend_failed',
    {
      title: 'Retry unsent credit emails',
      description:
        'Retry credit emails for anyone in this event who has not had one successfully sent — failed, skipped, or never attempted. Call with dry_run:true first to see the count and get a confirm_token.',
      inputSchema: {
        dry_run: z.boolean().default(true),
        confirm_token: z.string().optional(),
      },
    },
    async (args) => {
      const event = await getActiveEvent()
      const [row] = await db
        .select({ c: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(
          sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.emailStatus} = 'failed'`,
        )
      const count = Number(row?.c ?? 0)
      if (args.dry_run) {
        return text({
          previously_failed: count,
          confirm_token: issueConfirmToken('resend_failed', args),
          note: 'Re-run with dry_run:false and this confirm_token to resend.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'resend_failed', args)
      if (!check.ok) return staleToken(check.reason)
      const r = await runDispatch('all_unassigned')
      return text({ resent: r.emailed, failed: r.failed })
    },
  )

  server.registerTool(
    'sync_luma',
    {
      title: 'Sync the Luma guest list',
      description:
        'Pull the guest list from Luma into the active event. Set dispatch:true to also assign and email codes — that path requires the dry-run/confirm handshake.',
      inputSchema: {
        event_api_id: z.string().describe('Luma event id, e.g. evt-xxxx'),
        dispatch: z.boolean().default(false),
        dry_run: z.boolean().default(true),
        confirm_token: z.string().optional(),
      },
    },
    async (args) => {
      const [settings] = await db.select().from(appSettings).limit(1)
      if (!settings?.lumaApiKey) {
        return text({ error: 'Luma API key not configured. Add one in Settings → Luma.' })
      }
      const event = await getActiveEvent()

      // Syncing alone writes no codes and sends no mail, so it needs no gate.
      if (!args.dispatch) {
        const sync = await syncLumaGuests(settings.lumaApiKey, args.event_api_id, event.id)
        return text(sync)
      }
      if (args.dry_run) {
        const sync = await syncLumaGuests(settings.lumaApiKey, args.event_api_id, event.id)
        const p = await projectDispatch('luma')
        return text({
          sync,
          would_email: p.wouldEmail,
          would_burn_codes: p.wouldBurn,
          codes_remaining_after: p.remainingAfter,
          shortfall: p.shortfall,
          confirm_token: issueConfirmToken('sync_luma', args),
          note: 'Guests are synced. Re-run with dry_run:false and this confirm_token to email them.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'sync_luma', args)
      if (!check.ok) return staleToken(check.reason)
      const r = await runDispatch('luma')
      return text({
        assigned: r.assigned,
        emailed: r.emailed,
        failed: r.failed,
        out_of_codes: r.outOfCodes,
      })
    },
  )

  server.registerTool(
    'checkin',
    {
      title: 'Check an attendee in',
      description:
        'Check an attendee in or out at the door, by partial name or email. Fails clearly if the query matches more than one person.',
      inputSchema: {
        query: z.string().min(1).describe('Partial name or email'),
        checked_in: z.boolean().default(true),
      },
    },
    async ({ query, checked_in }) => {
      const event = await getActiveEvent()
      const term = `%${String(query).trim()}%`
      const rows = await db
        .select()
        .from(eventAttendees)
        .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
        .where(
          and(
            eq(eventAttendees.eventId, event.id),
            or(like(attendees.name, term), like(attendees.email, term))!,
          ),
        )
        .limit(5)
      if (rows.length === 0) return text({ error: `No attendee matches "${query}".` })
      if (rows.length > 1) {
        return text({
          error: `"${query}" matches ${rows.length} people. Be more specific.`,
          matches: rows.map((r) => ({ name: r.attendees.name, email: r.attendees.email })),
        })
      }
      const now = new Date().toISOString()
      await db
        .update(eventAttendees)
        .set({ checkedInAt: checked_in ? now : null, updatedAt: now })
        .where(eq(eventAttendees.id, rows[0].event_attendees.id))
      return text({
        name: rows[0].attendees.name,
        email: rows[0].attendees.email,
        checked_in,
      })
    },
  )
}
