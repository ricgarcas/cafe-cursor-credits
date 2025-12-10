import { NextRequest, NextResponse } from 'next/server'
import { syncLumaGuests } from '@/lib/luma/sync'
import { z } from 'zod'

const syncGuestsSchema = z.object({
  eventId: z.string().optional(), // Optional - will use settings if not provided
  status: z.enum(['confirmed', 'waitlist', 'declined', 'cancelled']).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const validation = syncGuestsSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { eventId, status } = validation.data

    const result = await syncLumaGuests(eventId, { status })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to sync Luma guests:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
