import { NextResponse } from 'next/server'
import { syncLumaEvents } from '@/lib/luma/sync'

export async function POST() {
  try {
    const result = await syncLumaEvents()

    return NextResponse.json({
      success: result.success,
      eventsSynced: result.eventsSynced,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Failed to sync Luma events:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}

