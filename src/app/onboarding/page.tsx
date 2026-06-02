import { OnboardingWizard } from '@/components/onboarding/wizard'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { currentUser } from '@/lib/auth/users'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  await ensureDefaultSettings()
  const [settings] = await db.select().from(appSettings).limit(1)
  const me = await currentUser()

  return (
    <OnboardingWizard
      initial={{
        city_name: settings?.cityName ?? '',
        country: settings?.country ?? '',
        timezone: settings?.timezone ?? 'America/Mexico_City',
        language: settings?.language ?? 'en',
        event_tagline: settings?.eventTagline ?? '',
        email_provider: (settings?.emailProvider as 'resend' | 'smtp') ?? 'resend',
        resend_api_key: settings?.resendApiKey ?? '',
        from_email: settings?.fromEmail ?? '',
        smtp_host: settings?.smtpHost ?? '',
        smtp_port: settings?.smtpPort ?? null,
        smtp_secure: settings?.smtpSecure ?? false,
        smtp_user: settings?.smtpUser ?? '',
        smtp_password: settings?.smtpPassword ?? '',
        admin_name: me?.name ?? '',
        admin_email: me?.email ?? '',
      }}
    />
  )
}
