import { resend } from '@/lib/resend'
import { renderCouponEmail } from './coupon-email'
import { Attendee, CouponCode } from '@/types/database'

interface SendCouponEmailParams {
  attendee: Attendee
  couponCode: CouponCode
}

export async function sendCouponEmail({ attendee, couponCode }: SendCouponEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Cafe Cursor Toronto <onboarding@resend.dev>',
      to: attendee.email,
      subject: 'Your Cursor Coupon Code!',
      html: renderCouponEmail({ attendee, couponCode }),
    })

    if (error) {
      console.error('Error sending email:', error)
      throw error
    }

    return { success: true, data }
  } catch (error) {
    console.error('Failed to send coupon email:', error)
    throw error
  }
}

