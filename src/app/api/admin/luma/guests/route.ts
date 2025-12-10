import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    
    // Get configured event ID from settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('luma_event_id')
      .limit(1)
      .single()

    if (!settings?.luma_event_id) {
      return NextResponse.json({ guests: [], message: 'No Luma event configured' })
    }

    // Fetch all Luma guests for the configured event with their coupon info
    const { data: guests, error } = await supabase
      .from('luma_guests')
      .select(`
        *,
        coupon_codes (
          id,
          code,
          is_used,
          used_at
        )
      `)
      .eq('luma_event_id', settings.luma_event_id)
      .order('registered_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch Luma guests:', error)
      return NextResponse.json(
        { error: 'Failed to fetch guests' },
        { status: 500 }
      )
    }

    return NextResponse.json({ guests: guests || [] })
  } catch (error) {
    console.error('Failed to fetch Luma guests:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch guests' },
      { status: 500 }
    )
  }
}

