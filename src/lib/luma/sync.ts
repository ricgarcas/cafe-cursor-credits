import { createAdminClient } from '@/lib/supabase/server'
import { createLumaService } from './service'
import { LumaEvent, LumaGuest } from '@/types/luma'
import { AppSettings } from '@/types/database'

interface SyncResult {
  success: boolean
  guestsSynced: number
  guestsAdded: number
  guestsUpdated: number
  errors: string[]
}

interface SyncOptions {
  status?: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
}

/**
 * Get app settings including API keys from database
 */
export async function getAppSettings(): Promise<AppSettings | null> {
  const supabase = await createAdminClient()
  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1)
    .single()
  
  return settings ?? null
}

/**
 * Get the configured Luma event ID from app_settings
 */
export async function getConfiguredEventId(): Promise<string | null> {
  const settings = await getAppSettings()
  return settings?.luma_event_id ?? null
}

/**
 * Sync guests from the configured Luma event
 * This ONLY syncs guest data - coupon assignment and emails are handled separately
 * If eventId is not provided, fetches from app_settings
 */
export async function syncLumaGuests(
  eventId?: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { status = 'confirmed' } = options
  
  const supabase = await createAdminClient()
  
  const result: SyncResult = {
    success: true,
    guestsSynced: 0,
    guestsAdded: 0,
    guestsUpdated: 0,
    errors: [],
  }

  // Get settings including API keys
  const settings = await getAppSettings()
  
  if (!settings?.luma_api_key) {
    return {
      ...result,
      success: false,
      errors: ['Luma API key not configured. Please set it in Settings.'],
    }
  }

  // Get event ID from settings if not provided
  const targetEventId = eventId || settings.luma_event_id
  
  if (!targetEventId) {
    return {
      ...result,
      success: false,
      errors: ['No Luma event configured. Please set a Luma event ID in settings.'],
    }
  }

  // Create Luma service with database-stored API key
  const luma = createLumaService(settings.luma_api_key)

  // Create sync log entry
  const { data: syncLog } = await supabase
    .from('luma_sync_logs')
    .insert({
      luma_event_id: targetEventId,
      sync_type: 'manual' as const,
      status: 'started' as const,
    })
    .select()
    .single()

  try {
    // Ensure event exists locally
    const event = await luma.getEvent(targetEventId)
    await upsertLumaEvent(supabase, event)

    // Fetch guests from Luma
    const guests = await luma.getAllEventGuests(targetEventId, status)
    result.guestsSynced = guests.length

    // Process guests in batches to avoid overwhelming the database
    const batchSize = 50
    for (let i = 0; i < guests.length; i += batchSize) {
      const batch = guests.slice(i, i + batchSize)
      
      for (const guest of batch) {
        try {
          const isNew = await upsertLumaGuest(supabase, targetEventId, guest)
          
          if (isNew) {
            result.guestsAdded++
          } else {
            result.guestsUpdated++
          }
        } catch (error) {
          result.errors.push(
            `Failed to process guest ${guest.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }

      // Small delay between batches
      if (i + batchSize < guests.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // Update event's last_synced_at
    await supabase
      .from('luma_events')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('luma_event_id', targetEventId)

    result.success = result.errors.length === 0

  } catch (error) {
    result.success = false
    result.errors.push(error instanceof Error ? error.message : 'Sync failed')
  }

  // Update sync log
  if (syncLog) {
    await supabase
      .from('luma_sync_logs')
      .update({
        status: result.success ? 'completed' : 'failed',
        guests_synced: result.guestsSynced,
        guests_added: result.guestsAdded,
        guests_updated: result.guestsUpdated,
        coupons_assigned: 0, // No longer assigning during sync
        error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id)
  }

  return result
}

/**
 * Upsert a Luma event to the database
 */
async function upsertLumaEvent(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  event: LumaEvent
): Promise<void> {
  const { error } = await supabase
    .from('luma_events')
    .upsert({
      luma_event_id: event.api_id,
      name: event.name,
      description: event.description || null,
      start_at: event.start_at,
      end_at: event.end_at,
      timezone: event.timezone,
      url: event.url || null,
      cover_url: event.cover_url || null,
      guest_count: event.guest_count,
      location_type: event.location?.type || null,
      location_name: event.location?.name || null,
      location_address: event.location?.address || null,
      visibility: event.visibility,
    }, {
      onConflict: 'luma_event_id',
    })

  if (error) {
    throw new Error(`Failed to upsert event: ${error.message}`)
  }
}

/**
 * Upsert a Luma guest to the database
 * Returns true if guest was newly created
 * Does NOT assign coupons or send emails - that's done separately via the admin UI
 */
async function upsertLumaGuest(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  eventId: string,
  guest: LumaGuest
): Promise<boolean> {
  // Check if guest exists
  const { data: existing } = await supabase
    .from('luma_guests')
    .select('id')
    .eq('luma_guest_id', guest.id)
    .single()

  const isNew = !existing

  const { error } = await supabase
    .from('luma_guests')
    .upsert({
      luma_guest_id: guest.id,
      luma_event_id: eventId,
      guest_key: guest.guest_key,
      name: guest.name,
      email: guest.email.toLowerCase(),
      registration_status: guest.registration_status,
      approval_status: guest.approval_status || null,
      attendance_status: guest.attendance_status || null,
      registered_at: guest.created_at,
      synced_at: new Date().toISOString(),
    }, {
      onConflict: 'luma_guest_id',
    })

  if (error) {
    throw new Error(`Failed to upsert guest: ${error.message}`)
  }

  return isNew
}
