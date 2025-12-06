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

    // Get attendee
    const { data: attendee, error: attendeeError } = await adminClient
      .from('attendees')
      .select()
      .eq('id', attendeeId)
      .single()

    if (attendeeError || !attendee) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
    }

    if (attendee.coupon_code_id) {
      return NextResponse.json({ error: 'Attendee already has a coupon assigned' }, { status: 400 })
    }

    // Find available coupon
    const { data: couponCode, error: couponError } = await adminClient
      .from('coupon_codes')
      .select()
      .eq('is_used', false)
      .is('used_at', null)
      .limit(1)
      .single()

    if (couponError || !couponCode) {
      return NextResponse.json({ error: 'No available coupon codes' }, { status: 400 })
    }

    // Assign coupon to attendee
    const { error: updateAttendeeError } = await adminClient
      .from('attendees')
      .update({ coupon_code_id: couponCode.id })
      .eq('id', attendeeId)

    if (updateAttendeeError) {
      return NextResponse.json({ error: 'Failed to assign coupon' }, { status: 500 })
    }

    // Mark coupon as used
    const { error: updateCouponError } = await adminClient
      .from('coupon_codes')
      .update({
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .eq('id', couponCode.id)

    if (updateCouponError) {
      return NextResponse.json({ error: 'Failed to update coupon status' }, { status: 500 })
    }

    // Send the email
    try {
      await sendCouponEmail({
        attendee: { ...attendee, coupon_code_id: couponCode.id },
        couponCode,
      })
    } catch (emailError) {
      console.error('Email sending failed:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error assigning coupon:', error)
    return NextResponse.json({ error: 'Failed to assign coupon' }, { status: 500 })
  }
}

