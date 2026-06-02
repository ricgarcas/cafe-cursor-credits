import 'server-only'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { renderCouponEmail } from './coupon-email'
import type { Attendee, CouponCode, AppSettings } from '@/lib/db/schema'

type EmailSettings = Pick<
  AppSettings,
  | 'emailProvider'
  | 'resendApiKey'
  | 'fromEmail'
  | 'smtpHost'
  | 'smtpPort'
  | 'smtpSecure'
  | 'smtpUser'
  | 'smtpPassword'
  | 'cityName'
>

interface SendCouponEmailParams {
  settings: EmailSettings
  attendee: Pick<Attendee, 'name' | 'email'> & Partial<Attendee>
  couponCode: Pick<CouponCode, 'code'> & Partial<CouponCode>
  fromName?: string
}

/** Returns true if the configured provider has the minimum fields to send. */
export function canSendEmail(settings: EmailSettings | null | undefined): boolean {
  if (!settings) return false
  const provider = settings.emailProvider ?? 'resend'
  if (provider === 'smtp') {
    return Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPassword)
  }
  return Boolean(settings.resendApiKey)
}

/**
 * Dispatches the coupon email to whichever provider the admin configured.
 * Callers just pass settings; the provider choice lives in the DB row.
 */
export async function sendCouponEmail({
  settings,
  attendee,
  couponCode,
  fromName = 'Cafe Cursor',
}: SendCouponEmailParams) {
  const html = renderCouponEmail({
    attendee,
    couponCode,
    cityName: settings.cityName,
  })
  const subject = 'Your Cursor credits'
  const provider = settings.emailProvider ?? 'resend'

  if (provider === 'smtp') {
    return sendViaSmtp({ settings, attendee, html, subject, fromName })
  }
  return sendViaResend({ settings, attendee, html, subject, fromName })
}

async function sendViaResend({
  settings,
  attendee,
  html,
  subject,
  fromName,
}: {
  settings: EmailSettings
  attendee: { email: string }
  html: string
  subject: string
  fromName: string
}) {
  if (!settings.resendApiKey) {
    throw new Error('Resend API key is not configured.')
  }
  const client = new Resend(settings.resendApiKey)
  const from = settings.fromEmail || 'onboarding@resend.dev'
  const { data, error } = await client.emails.send({
    from: `${fromName} <${from}>`,
    to: attendee.email,
    subject,
    html,
  })
  if (error) {
    console.error('resend send error', error)
    throw error
  }
  return { success: true, data }
}

async function sendViaSmtp({
  settings,
  attendee,
  html,
  subject,
  fromName,
}: {
  settings: EmailSettings
  attendee: { email: string }
  html: string
  subject: string
  fromName: string
}) {
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
    throw new Error('SMTP is not fully configured (host, user, password required).')
  }
  const port = settings.smtpPort || (settings.smtpSecure ? 465 : 587)
  const transport = nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: settings.smtpSecure, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPassword,
    },
  })
  const from = settings.fromEmail || settings.smtpUser
  const info = await transport.sendMail({
    from: `${fromName} <${from}>`,
    to: attendee.email,
    subject,
    html,
  })
  return { success: true, data: { id: info.messageId } }
}
