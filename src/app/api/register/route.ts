import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendCouponEmail } from '@/lib/emails/send-coupon-email'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const result = registerSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.issues },
        { status: 400 }
      )
    }

    const { name, email } = result.data
    const supabase = await createAdminClient()

    // Check if email already exists
    const { data: existingAttendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingAttendee) {
      return NextResponse.json(
        { error: 'This email is already registered' },
        { status: 400 }
      )
    }

    // Create the attendee
    const { data: attendee, error: attendeeError } = await supabase
      .from('attendees')
      .insert({
        name,
        email: email.toLowerCase(),
        registered_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (attendeeError) {
      console.error('Error creating attendee:', attendeeError)
      return NextResponse.json(
        { error: 'Failed to create registration' },
        { status: 500 }
      )
    }

    // Try to find an available coupon code
    const { data: couponCode, error: couponError } = await supabase
      .from('coupon_codes')
      .select()
      .eq('is_used', false)
      .is('used_at', null)
      .limit(1)
      .single()

    let couponAssigned = false

    if (couponCode && !couponError) {
      // Assign the coupon to the attendee
      const { error: updateAttendeeError } = await supabase
        .from('attendees')
        .update({ coupon_code_id: couponCode.id })
        .eq('id', attendee.id)

      if (!updateAttendeeError) {
        // Mark the coupon as used
        const { error: updateCouponError } = await supabase
          .from('coupon_codes')
          .update({
            is_used: true,
            used_at: new Date().toISOString(),
          })
          .eq('id', couponCode.id)

        if (!updateCouponError) {
          couponAssigned = true

          // Send the coupon email
          try {
            await sendCouponEmail({
              attendee: { ...attendee, coupon_code_id: couponCode.id },
              couponCode,
            })
          } catch (emailError) {
            console.error('Failed to send email:', emailError)
            // Don't fail the registration if email fails
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      couponAssigned,
      message: couponAssigned
        ? 'Registration successful! Check your email for your coupon code.'
        : 'Registration successful!',
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

