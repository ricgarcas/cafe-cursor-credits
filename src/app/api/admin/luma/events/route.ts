import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createAdminClient()

    const { data: events, error } = await supabase
      .from('luma_events')
      .select('*')
      .order('start_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Failed to fetch Luma events:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 }
    )
  }
}

