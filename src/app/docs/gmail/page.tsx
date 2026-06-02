import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'

export const metadata = {
  title: 'Gmail SMTP setup — Cafe Cursor',
  description: 'Send Cafe Cursor emails through your personal Gmail using an App Password.',
}

export default function GmailGuidePage() {
  return (
    <PublicShell
      title="Email with Gmail"
      tagline="Use your own Gmail to send attendee codes. Zero cost, ten minutes of setup."
    >
      <article className="w-full max-w-none text-[15px] leading-relaxed space-y-8">
        <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_24px_48px_-12px_rgb(0_0_0_/_0.18),0_8px_16px_-8px_rgb(0_0_0_/_0.12)] dark:shadow-[0_32px_64px_-16px_rgb(0_0_0_/_0.5),0_12px_20px_-8px_rgb(0_0_0_/_0.35)] space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
            <Mail className="size-3.5" /> Gmail SMTP · App Passwords
          </div>
          <p>
            Gmail doesn&apos;t let apps sign in with your normal password — you
            generate a 16-character <strong>App Password</strong> instead. It
            scopes to Mail only and can be revoked any time.
          </p>
          <p>
            Free quota: ~500 emails/day on personal Gmail, ~2,000/day on
            Workspace. Perfect for a meetup; if you plan bigger lists, prefer{' '}
            <Link href="/docs/resend" className="underline underline-offset-4">Resend</Link>.
          </p>
          <p className="text-muted-foreground text-sm">
            Heads-up: Gmail doesn&apos;t verify your sending domain the way
            Resend does, so messages <em>may</em> land in spam. Tell attendees
            to check their spam folder or add your Gmail to contacts.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">1. Turn on 2-Step Verification</h2>
          <p>
            App Passwords only exist when 2-Step Verification is on for your
            Google account.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Open{' '}
              <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                Google Account → Security
              </a>.
            </li>
            <li>
              Under <strong>How you sign in to Google</strong>, click{' '}
              <strong>2-Step Verification</strong> and follow the prompts
              (phone number + confirmation).
            </li>
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">2. Generate an App Password</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Go to{' '}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                myaccount.google.com/apppasswords
              </a>.
            </li>
            <li>
              Name it something like <code className="font-code">Cafe Cursor Mexico City</code>
              {' '}and click <strong>Create</strong>.
            </li>
            <li>
              Google shows you a 16-character password in a yellow box (e.g.{' '}
              <code className="font-code">abcd efgh ijkl mnop</code>). Copy it.
              You won&apos;t see it again.
            </li>
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">3. Paste it into Cafe Cursor</h2>
          <p>
            Open{' '}
            <Link href="/admin/settings" className="underline underline-offset-4">
              Admin → Settings
            </Link>
            , switch <strong>Provider</strong> to <strong>Gmail / SMTP</strong>, and fill in:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Email address</strong>: your Gmail (e.g. <code className="font-code">you@gmail.com</code>).</li>
            <li><strong>App password</strong>: the 16-char value you just generated.</li>
            <li><strong>SMTP host</strong>: <code className="font-code">smtp.gmail.com</code> (pre-filled).</li>
            <li><strong>Port</strong>: <code className="font-code">587</code> (pre-filled, STARTTLS).</li>
          </ul>
          <p>
            Save. The next registration will send through your Gmail. If
            nothing arrives, check{' '}
            <a href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              Gmail &raquo; Sent
            </a>
            {' '}— you&apos;ll see each message there.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight">Troubleshooting</h2>
          <dl className="space-y-4">
            <div>
              <dt className="font-medium">&quot;Username and Password not accepted&quot;</dt>
              <dd className="text-muted-foreground">
                You&apos;re using your regular Gmail password instead of the App
                Password. Go back to step 2.
              </dd>
            </div>
            <div>
              <dt className="font-medium">App passwords option missing</dt>
              <dd className="text-muted-foreground">
                You haven&apos;t enabled 2-Step Verification, or your account is
                a Workspace account where the admin disabled App Passwords.
                Ask your admin, or use Resend instead.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Emails go to spam</dt>
              <dd className="text-muted-foreground">
                Common with Gmail SMTP. For a production meetup with 100+
                attendees, a verified Resend domain has much better
                deliverability.
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
