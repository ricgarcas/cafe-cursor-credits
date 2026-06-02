import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'

export const metadata = {
  title: 'Resend setup — Cafe Cursor',
  description: 'How to get a Resend API key and wire email delivery into Cafe Cursor.',
}

export default function ResendGuidePage() {
  return (
    <PublicShell
      title="Email with Resend"
      tagline="Five minutes to have attendees receive their Cursor credit codes automatically."
    >
      <article className="prose-like w-full max-w-none text-[15px] leading-relaxed space-y-8">
        <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_24px_48px_-12px_rgb(0_0_0_/_0.18),0_8px_16px_-8px_rgb(0_0_0_/_0.12)] dark:shadow-[0_32px_64px_-16px_rgb(0_0_0_/_0.5),0_12px_20px_-8px_rgb(0_0_0_/_0.35)] space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
            <Mail className="size-3.5" /> Why Resend
          </div>
          <p>
            Cafe Cursor sends each attendee their Cursor credit code by email
            right after they register. The codes come from <strong>your</strong>{' '}
            sending domain — so attendees get a branded, verified message
            instead of a no-reply address.
          </p>
          <p>
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Resend</a>{' '}
            is the provider we use — 3,000 free emails/month, 100/day, no
            credit card required. That&apos;s way more than any meetup needs.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">1. Create a Resend account</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Go to{' '}
              <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                resend.com/signup
              </a>{' '}
              and create an account (GitHub or email).
            </li>
            <li>Skip the onboarding modal — you&apos;ll come back to domains in a moment.</li>
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">2. Verify a sending domain</h2>
          <p>
            You need a domain you control (e.g. <code className="font-code">cafe-cursor-mexico.com</code>).
            If you only want to test, you can skip this step and Resend will
            let you send from <code className="font-code">onboarding@resend.dev</code>,
            but attendees may see it flagged as unverified/spam.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              In the dashboard go to{' '}
              <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Domains</a>
              {' '}→ <strong>Add Domain</strong>.
            </li>
            <li>
              Paste your domain, pick the region closest to your city, click <strong>Add</strong>.
            </li>
            <li>
              Resend shows you 3–4 DNS records (SPF, DKIM, optionally DMARC).
              Copy them to your DNS provider (Cloudflare, Namecheap, etc.).
            </li>
            <li>
              Back in Resend click <strong>Verify DNS Records</strong>.
              Propagation is usually instant, sometimes up to 30 min.
            </li>
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">3. Create an API key</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Open{' '}
              <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">API Keys</a>
              {' '}→ <strong>Create API Key</strong>.
            </li>
            <li>
              Name it something like <code className="font-code">cafe-cursor-mexico</code>.
              Set permission to <strong>Sending access</strong> and scope to
              your verified domain.
            </li>
            <li>
              Copy the key (<code className="font-code">re_…</code>). You&apos;ll only see it once.
            </li>
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">4. Paste it into Cafe Cursor</h2>
          <p>
            Open{' '}
            <Link href="/admin/settings" className="underline underline-offset-4">
              Admin → Settings
            </Link>{' '}
            and fill in:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Resend API key</strong>: the <code className="font-code">re_…</code> value you just copied.</li>
            <li><strong>From email</strong>: any address on your verified domain, e.g. <code className="font-code">hello@cafe-cursor-mexico.com</code>.</li>
          </ul>
          <p>
            Save. The next registration will receive their code by email
            within a second. If it didn&apos;t, check the Resend dashboard{' '}
            <a href="https://resend.com/emails" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Emails</a>
            {' '}tab for the failure reason.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">Troubleshooting</h2>
          <dl className="space-y-4">
            <div>
              <dt className="font-medium">Invalid API key</dt>
              <dd className="text-muted-foreground">
                The key is scoped to a specific domain. If you rotated it or
                scoped it elsewhere, create a new one for this deployment.
              </dd>
            </div>
            <div>
              <dt className="font-medium">From email rejected</dt>
              <dd className="text-muted-foreground">
                The address must be on a <em>verified</em> domain in Resend.
                Any prefix works (<code className="font-code">hello@</code>,{' '}
                <code className="font-code">noreply@</code>,{' '}
                <code className="font-code">events@</code>).
              </dd>
            </div>
            <div>
              <dt className="font-medium">Attendees aren&apos;t getting emails</dt>
              <dd className="text-muted-foreground">
                Check the Resend Emails log first. If messages show as{' '}
                <em>delivered</em> but never land, the recipient&apos;s inbox
                provider may be filtering — tell attendees to check spam or add
                your from-address to contacts.
              </dd>
            </div>
          </dl>
        </section>

        <div className="pt-4">
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to Settings
          </Link>
        </div>
      </article>
    </PublicShell>
  )
}
