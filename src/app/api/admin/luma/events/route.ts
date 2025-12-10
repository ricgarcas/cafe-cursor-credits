import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createLumaService } from '@/lib/luma/service'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET - Fetch the configured Luma event details
 */
export async function GET() {
  try {
    const supabase = await createAdminClient()

    // Get the configured event ID from settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('luma_event_id')
      .limit(1)
      .single()

    if (!settings?.luma_event_id) {
      return NextResponse.json({ event: null, configured: false })
    }

    // Get cached event details from luma_events table
    const { data: event } = await supabase
      .from('luma_events')
      .select('*')
      .eq('luma_event_id', settings.luma_event_id)
      .single()

    // Get recent sync logs
    const { data: syncLogs } = await supabase
      .from('luma_sync_logs')
      .select('*')
      .eq('luma_event_id', settings.luma_event_id)
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({ 
      event, 
      configured: true,
      eventId: settings.luma_event_id,
      syncLogs: syncLogs || []
    })
  } catch (error) {
    console.error('Failed to fetch Luma event:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch event' },
      { status: 500 }
    )
  }
}

const setEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
})

/**
 * PUT - Set or update the configured Luma event ID
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = setEventSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      )
    }

    let { eventId } = validation.data

    // Extract event ID from URL if full URL was provided
    // Handles formats like: lu.ma/abc123, https://lu.ma/abc123, evt-abc123
    if (eventId.includes('lu.ma/')) {
      const match = eventId.match(/lu\.ma\/([a-zA-Z0-9-]+)/)
      if (match) {
        eventId = match[1]
      }
    }

    const supabase = await createAdminClient()

    // Fetch API key from database
    const { data: settings } = await supabase
      .from('app_settings')
      .select('luma_api_key')
      .limit(1)
      .single()

    if (!settings?.luma_api_key) {
      return NextResponse.json(
        { success: false, error: 'Luma API key not configured. Please set it in Settings first.' },
        { status: 400 }
      )
    }

    // Verify the event exists in Luma
    const luma = createLumaService(settings.luma_api_key)
    let eventDetails
    try {
      eventDetails = await luma.getEvent(eventId)
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Event not found in Luma. Please check the event ID.' },
        { status: 404 }
      )
    }

    // Cache the event details
    const { error: upsertError } = await supabase
      .from('luma_events')
      .upsert({
        luma_event_id: eventDetails.api_id,
        name: eventDetails.name,
        description: eventDetails.description || null,
        start_at: eventDetails.start_at,
        end_at: eventDetails.end_at,
        timezone: eventDetails.timezone,
        url: eventDetails.url || null,
        cover_url: eventDetails.cover_url || null,
        guest_count: eventDetails.guest_count,
        location_type: eventDetails.location?.type || null,
        location_name: eventDetails.location?.name || null,
        location_address: eventDetails.location?.address || null,
        visibility: eventDetails.visibility,
      }, {
        onConflict: 'luma_event_id',
      })

    if (upsertError) {
      throw new Error(`Failed to cache event: ${upsertError.message}`)
    }

    // Update the settings with the event ID
    const { data: currentSettings } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .single()

    if (currentSettings) {
      await supabase
        .from('app_settings')
        .update({ luma_event_id: eventDetails.api_id })
        .eq('id', currentSettings.id)
    } else {
      await supabase
        .from('app_settings')
        .insert({ luma_event_id: eventDetails.api_id })
    }

    return NextResponse.json({ 
      success: true, 
      eventId: eventDetails.api_id,
      event: {
        luma_event_id: eventDetails.api_id,
        name: eventDetails.name,
        start_at: eventDetails.start_at,
        end_at: eventDetails.end_at,
        guest_count: eventDetails.guest_count,
        url: eventDetails.url,
      }
    })
  } catch (error) {
    console.error('Failed to set Luma event:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to set event' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Remove the configured Luma event
 */
export async function DELETE() {
  try {
    const supabase = await createAdminClient()

    const { data: currentSettings } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .single()

    if (currentSettings) {
      await supabase
        .from('app_settings')
        .update({ luma_event_id: null })
        .eq('id', currentSettings.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove Luma event:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to remove event' },
      { status: 500 }
    )
  }
}
