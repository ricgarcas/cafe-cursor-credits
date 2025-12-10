import { NextRequest, NextResponse } from 'next/server'
import { syncLumaGuests } from '@/lib/luma/sync'
import { z } from 'zod'

const syncGuestsSchema = z.object({
  eventId: z.string().min(1),
  assignCoupons: z.boolean().optional().default(true),
  sendEmails: z.boolean().optional().default(true),
  status: z.enum(['confirmed', 'waitlist', 'declined', 'cancelled']).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = syncGuestsSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { eventId, assignCoupons, sendEmails, status } = validation.data

    const result = await syncLumaGuests(eventId, {
      assignCoupons,
      sendEmails,
      status,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to sync Luma guests:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}

