import { Resend } from 'resend'
import { renderCouponEmail } from './coupon-email'
import { Attendee, CouponCode } from '@/types/database'

interface SendCouponEmailParams {
  resendClient: Resend
  attendee: Attendee
  couponCode: CouponCode
  fromName?: string
}

export async function sendCouponEmail({ 
  resendClient, 
  attendee, 
  couponCode,
  fromName = 'Cafe Cursor'
}: SendCouponEmailParams) {
  try {
    const { data, error } = await resendClient.emails.send({
      from: `${fromName} <onboarding@resend.dev>`,
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

