import type { Attendee, CouponCode } from '@/lib/db/schema'

interface CouponEmailProps {
  attendee: Pick<Attendee, 'name' | 'email'>
  couponCode: Pick<CouponCode, 'code'>
  cityName?: string
}

function redemptionUrl(code: string): string {
  if (/^https?:\/\//i.test(code)) return code
  return `https://cursor.com/referral?code=${encodeURIComponent(code)}`
}

/**
 * HTML email template for the "here's your Cursor credit code" message.
 * Uses a dark, code-editor-style palette matching the app aesthetic.
 */
export function renderCouponEmail({ attendee, couponCode, cityName }: CouponEmailProps): string {
  const firstName = attendee.name.split(' ')[0]
  const redeem = redemptionUrl(couponCode.code)
  const venue = cityName ? `Cafe Cursor ${cityName}` : 'Cafe Cursor'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Cursor credit code</title>
</head>
<body style="margin:0;padding:0;background:#0F0F10;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Arial,sans-serif;color:#F5F5F5;">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background:#0F0F10;">
    <tr>
      <td style="padding:40px 20px;" align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <div style="display:inline-flex;align-items:center;gap:10px;color:#F5F5F5;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;">
                <span style="display:inline-block;width:22px;height:22px;background:#1a1a1d;border:1px solid #2a2a30;border-radius:4px;"></span>
                Cafe Cursor
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#18181A;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:36px 32px;">
              <h1 style="margin:0 0 6px 0;font-size:28px;font-weight:500;letter-spacing:-0.02em;color:#F5F5F5;">Hi ${firstName},</h1>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.55;color:#B4B4B8;">
                Thanks for registering for ${venue}. Here are your free Cursor credits.
              </p>

              <div style="background:#0F0F10;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:20px;text-align:center;">
                <div style="font-family:'JetBrains Mono','Menlo','Courier New',monospace;font-size:18px;color:#F5F5F5;word-break:break-all;margin-bottom:16px;">
                  ${couponCode.code}
                </div>
                <a href="${redeem}" style="display:inline-block;padding:12px 28px;background:#F5F5F5;color:#0F0F10;text-decoration:none;border-radius:999px;font-size:15px;font-weight:500;">
                  Redeem credits
                </a>
              </div>

              <p style="margin:22px 0 0 0;font-size:13px;color:#6F6F76;line-height:1.5;">
                This code is one-time use. If it doesn't work, reply to this email and we'll sort it out.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;color:#6F6F76;font-size:12px;line-height:1.5;">
              ${venue}<br/>
              Built for the <a href="https://cursor.com/ambassadors" style="color:#B4B4B8;text-decoration:underline;">Cursor Ambassador Community</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
