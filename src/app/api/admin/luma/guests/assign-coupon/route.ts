import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

const assignCouponSchema = z.object({
  lumaGuestId: z.string().min(1, 'Luma guest ID is required'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = assignCouponSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { lumaGuestId } = validation.data
    const supabase = await createAdminClient()

    // Get the Luma guest
    const { data: guest, error: guestError } = await supabase
      .from('luma_guests')
      .select('*')
      .eq('luma_guest_id', lumaGuestId)
      .single()

    if (guestError || !guest) {
      return NextResponse.json(
        { success: false, error: 'Luma guest not found' },
        { status: 404 }
      )
    }

    // Check if guest already has a coupon assigned
    if (guest.coupon_code_id) {
      return NextResponse.json(
        { success: false, error: 'Guest already has a coupon assigned' },
        { status: 400 }
      )
    }

    // Find an available coupon
    const { data: couponCode, error: couponError } = await supabase
      .from('coupon_codes')
      .select('*')
      .eq('is_used', false)
      .is('used_at', null)
      .limit(1)
      .single()

    if (couponError || !couponCode) {
      return NextResponse.json(
        { success: false, error: 'No available coupon codes' },
        { status: 400 }
      )
    }

    // Assign coupon to guest
    const { error: updateGuestError } = await supabase
      .from('luma_guests')
      .update({
        coupon_code_id: couponCode.id,
      })
      .eq('luma_guest_id', lumaGuestId)

    if (updateGuestError) {
      return NextResponse.json(
        { success: false, error: 'Failed to assign coupon to guest' },
        { status: 500 }
      )
    }

    // Mark coupon as used with tracking info
    const { error: updateCouponError } = await supabase
      .from('coupon_codes')
      .update({
        is_used: true,
        used_at: new Date().toISOString(),
        used_by_type: 'luma_guest',
        used_by_luma_guest_id: lumaGuestId,
      })
      .eq('id', couponCode.id)

    if (updateCouponError) {
      // Rollback guest update
      await supabase
        .from('luma_guests')
        .update({ coupon_code_id: null })
        .eq('luma_guest_id', lumaGuestId)

      return NextResponse.json(
        { success: false, error: 'Failed to mark coupon as used' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      couponCode: couponCode.code,
      message: 'Coupon assigned successfully',
    })
  } catch (error) {
    console.error('Failed to assign coupon:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to assign coupon' },
      { status: 500 }
    )
  }
}

