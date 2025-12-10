import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Fetch public settings (city_name, timezone)
// No authentication required - uses public RLS policy
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('city_name, timezone')
      .limit(1)
      .single()

    if (error) {
      // Return defaults if settings don't exist yet
      return NextResponse.json({
        city_name: 'Cafe Cursor',
        timezone: 'America/Toronto',
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Public settings GET error:', error)
    // Return defaults on error
    return NextResponse.json({
      city_name: 'Cafe Cursor',
      timezone: 'America/Toronto',
    })
  }
}

