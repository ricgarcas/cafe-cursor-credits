import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createResendClient } from '@/lib/resend'
import { sendCouponEmail } from '@/lib/emails/send-coupon-email'
import { z } from 'zod'

const sendEmailSchema = z.object({
  lumaGuestId: z.string().min(1, 'Luma guest ID is required'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = sendEmailSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { lumaGuestId } = validation.data
    const supabase = await createAdminClient()

    // Get settings for API keys and city name
    const { data: settings } = await supabase
      .from('app_settings')
      .select('resend_api_key, city_name')
      .limit(1)
      .single()

    if (!settings?.resend_api_key) {
      return NextResponse.json(
        { success: false, error: 'Resend API key not configured. Please set it in Settings.' },
        { status: 400 }
      )
    }

    // Get the Luma guest with their coupon
    const { data: guest, error: guestError } = await supabase
      .from('luma_guests')
      .select(`
        *,
        coupon_codes (*)
      `)
      .eq('luma_guest_id', lumaGuestId)
      .single()

    if (guestError || !guest) {
      return NextResponse.json(
        { success: false, error: 'Luma guest not found' },
        { status: 404 }
      )
    }

    // Check if guest has a coupon assigned
    if (!guest.coupon_code_id || !guest.coupon_codes) {
      return NextResponse.json(
        { success: false, error: 'Guest does not have a coupon assigned. Please assign a coupon first.' },
        { status: 400 }
      )
    }

    // Send the email
    const resendClient = createResendClient(settings.resend_api_key)
    
    try {
      await sendCouponEmail({
        resendClient,
        attendee: {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          coupon_code_id: guest.coupon_code_id,
          registered_at: guest.registered_at || guest.created_at,
          created_at: guest.created_at,
          updated_at: guest.updated_at,
          luma_guest_id: guest.luma_guest_id,
          luma_event_id: guest.luma_event_id,
          source: 'luma' as const,
        },
        couponCode: guest.coupon_codes,
        fromName: `Cafe Cursor ${settings.city_name}`,
      })
    } catch (emailError) {
      console.error('Failed to send email:', emailError)
      return NextResponse.json(
        { success: false, error: 'Failed to send email. Please try again.' },
        { status: 500 }
      )
    }

    // Update email_sent_at timestamp
    const { error: updateError } = await supabase
      .from('luma_guests')
      .update({
        email_sent_at: new Date().toISOString(),
      })
      .eq('luma_guest_id', lumaGuestId)

    if (updateError) {
      console.warn('Failed to update email_sent_at:', updateError)
      // Don't fail the request since email was sent successfully
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
    })
  } catch (error) {
    console.error('Failed to send email:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}

