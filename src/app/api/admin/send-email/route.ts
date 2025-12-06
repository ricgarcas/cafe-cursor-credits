import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendCouponEmail } from '@/lib/emails/send-coupon-email'

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { attendeeId } = await request.json()

    if (!attendeeId) {
      return NextResponse.json({ error: 'Attendee ID is required' }, { status: 400 })
    }

    const adminClient = await createAdminClient()

    // Get attendee with coupon
    const { data: attendee, error: attendeeError } = await adminClient
      .from('attendees')
      .select(`*, coupon_codes (*)`)
      .eq('id', attendeeId)
      .single()

    if (attendeeError || !attendee) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
    }

    if (!attendee.coupon_codes) {
      return NextResponse.json({ error: 'Attendee does not have a coupon assigned' }, { status: 400 })
    }

    // Send the email
    await sendCouponEmail({
      attendee,
      couponCode: attendee.coupon_codes,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}

