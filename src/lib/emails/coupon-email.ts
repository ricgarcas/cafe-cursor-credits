import { Attendee, CouponCode } from '@/types/database'

interface CouponEmailProps {
  attendee: Attendee
  couponCode: CouponCode
}

export function renderCouponEmail({ attendee, couponCode }: CouponEmailProps): string {
  const firstName = attendee.name.split(' ')[0]
  const redemptionUrl = `https://cursor.com/referral?code=${couponCode.code}`

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Cursor Coupon Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #000000;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #000000; background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: 20px 20px;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <div style="width: 64px; height: 64px; background-color: #27272a; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: rgba(0, 0, 0, 0.8); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
                                <tr>
                                    <td style="padding: 40px 32px;">
                                        <h2 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 400; color: #ffffff;">
                                            Hello ${firstName},
                                        </h2>
                                        <p style="margin: 0 0 24px 0; font-size: 16px; color: #d4d4d8; line-height: 1.5;">
                                            Thank you for registering for Cafe Cursor Toronto.
                                        </p>

                                        <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                                            Your Cursor Coupon Code
                                        </h3>
                                        <p style="margin: 0 0 16px 0; font-size: 14px; color: #d4d4d8; line-height: 1.5;">
                                            You've received an exclusive coupon code:
                                        </p>

                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 24px; text-align: center;">
                                                    <div style="font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: 0.05em; margin-bottom: 16px; font-family: 'Courier New', monospace;">
                                                        ${couponCode.code}
                                                    </div>
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td align="center">
                                                                <a href="${redemptionUrl}" style="display: inline-block; padding: 12px 32px; background-color: #52525b; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.15);">
                                                                    Redeem Your Credits
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-top: 32px;">
                            <p style="margin: 0; font-size: 14px; color: #71717a;">
                                Cafe Cursor Toronto
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim()
}

