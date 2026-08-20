import Link from 'next/link'
import { Eye, PencilLine, ShieldCheck, Terminal, Mail } from 'lucide-react'
import { CopyBlock } from '@/components/docs/copy-block'
import { Prompt } from '@/components/docs/prompt'

const MCP_JSON = `{
  "mcpServers": {
    "cafe-cursor": {
      "url": "https://your-deployment.example.com/api/mcp"
    }
  }
}`

const CI_CURL = `curl -X POST https://your-deployment.example.com/oauth/token \\
  -d grant_type=client_credentials \\
  -d client_id=cc_client_... \\
  -d client_secret=cc_secret_...`

const PROJECTION = `would_email: 43
would_burn_codes: 43
codes_available: 69
codes_remaining_after: 26
shortfall: 0`

const READ_TOOLS: [string, string][] = [
  ['readiness_check', 'What is still missing before doors open'],
  ['event_status', 'Registrations, check-ins, codes claimed and left'],
  ['find_attendee', 'Look someone up by partial name or email'],
  ['export_attendees', 'Pull the attendee list as data'],
]

const WRITE_TOOLS: [string, string][] = [
  ['setup_city', 'City, country, timezone, public tagline'],
  ['create_event', 'A dated edition, optionally the active one'],
  ['add_codes', 'Import credit codes into the shared pool'],
  ['set_claim_portal', 'Open or close the public claim page'],
  ['configure_email', 'Save Resend or SMTP settings, send a real test'],
  ['sync_luma', 'Pull the guest list from Luma'],
  ['dispatch_codes', 'Assign codes and email them'],
  ['resend_failed', 'Retry anyone who never got a code'],
  ['checkin', 'Check an attendee in at the door'],
]

/**
 * A numbered step. The rule down the left ties the number to its content, so
 * the eye can find where each step begins without another box.
 */
function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="relative min-w-0 pl-12 sm:pl-16">
      <span className="absolute left-0 top-0 flex size-9 items-center justify-center rounded-full border border-border bg-card font-display text-base tabular-nums">
        {n}
      </span>
      <span
        aria-hidden
        className="absolute bottom-0 left-[17px] top-11 w-px bg-border sm:left-[17px]"
      />
      <h2 className="pt-1 font-display text-2xl tracking-tight">{title}</h2>
      <div className="mt-4 min-w-0 max-w-2xl space-y-4">{children}</div>
    </section>
  )
}

/** Reference block for the grid below the walkthrough. */
function RefCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon: typeof Eye
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={
        'min-w-0 space-y-4 rounded-[14px] border border-border bg-card p-6 ' +
        (className ?? '')
      }
    >
      <h3 className="flex items-center gap-2 font-display text-lg tracking-tight">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h3>
      {children}
    </section>
  )
}

function ToolList({ label, tools }: { label: string; tools: [string, string][] }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <dl className="divide-y divide-border/60">
        {tools.map(([name, what]) => (
          <div key={name} className="grid gap-0.5 py-2 sm:grid-cols-[11rem_1fr] sm:gap-4">
            <dt className="font-code text-[13px]">{name}</dt>
            <dd className="text-sm text-muted-foreground">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * The Cursor/MCP walkthrough. Rendered inside the admin shell and mirrored at
 * the public /docs route, which the README links.
 *
 * The walkthrough runs full-width top to bottom — it is a sequence, and
 * columns would break the reading order. Only the reference material below
 * goes two-up, where scanning beats reading.
 */
export function CursorGuide() {
  return (
    <div className="min-w-0 space-y-16 text-[15px] leading-relaxed">
      <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
        This deployment ships its own MCP server. Once Cursor is connected you
        stop clicking through the dashboard and just say what you want.
        Everything the dashboard can do, Cursor can do — and anything that emails
        people or burns a code still shows you the numbers and waits for a yes.
      </p>

      <div className="space-y-14">
        <Step n={1} title="Connect Cursor">
          <p>
            Open <code className="font-code">~/.cursor/mcp.json</code> and add
            this, replacing the URL with your deployment:
          </p>
          <CopyBlock code={MCP_JSON} label="~/.cursor/mcp.json" />
          <p>
            There is no key to paste. Open{' '}
            <strong>Cursor Settings &rarr; MCP</strong>, find{' '}
            <code className="font-code">cafe-cursor</code>, and click{' '}
            <strong>Connect</strong>.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
            <li>A browser tab opens on your deployment&apos;s sign-in page.</li>
            <li>
              Log in with your <strong>admin account</strong> — the same email
              and password you use here.
            </li>
            <li>Approve the permissions. That is the whole setup.</li>
          </ol>
          <div className="rounded-[10px] border border-border bg-muted/40 p-4">
            <p className="text-sm">
              <strong>Whose account is this? Yours.</strong> There is no
              &ldquo;Sign in with Cursor&rdquo; and no cursor.com account
              involved — this deployment is its own authorization server, and the
              access it issues is tied to your user here. Revoke it in{' '}
              <Link
                href="/admin/settings"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Settings &rarr; Connections
              </Link>{' '}
              and that Cursor install stops working immediately.
            </p>
          </div>
        </Step>

        <Step n={2} title="Set up an event">
          <p>Day zero. Start from nothing and let Cursor walk the config:</p>
          <Prompt>
            Set up Cafe Cursor Bogot&aacute; for September 12th, timezone
            America/Bogota. Then tell me what&apos;s still missing.
          </Prompt>
          <p>
            It creates the city identity and a dated edition, runs a readiness
            check, and reports the gaps — usually codes and email.
          </p>
          <Prompt>Here are 80 codes, import them. [paste your codes]</Prompt>
          <Prompt>
            Configure email with Resend using this API key, sending from
            hello@cafecursor.co, and send yourself a test.
          </Prompt>
          <p className="text-muted-foreground">
            Email setup delivers a real message to your inbox, so a typo in the
            domain surfaces now rather than on the morning of the event.
          </p>
        </Step>

        <Step n={3} title="Run the day">
          <p>Doors open. This is the part worth having in a chat window:</p>
          <Prompt>Sync Luma and email everyone their code.</Prompt>
          <Prompt>Is Ana checked in? If not, check her in.</Prompt>
          <Prompt>How many codes are left, and did anyone&apos;s email bounce?</Prompt>
          <Prompt>
            Some people never got theirs — retry whoever hasn&apos;t been emailed
            successfully.
          </Prompt>
        </Step>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Reference
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <RefCard title="Nothing irreversible happens silently" icon={ShieldCheck}>
            <p className="text-sm text-muted-foreground">
              Emails and credit codes cannot be taken back, so every tool that
              sends or burns projects first and refuses to act until you confirm:
            </p>
            <CopyBlock code={PROJECTION} />
            <p className="text-sm text-muted-foreground">
              If the arguments change between the projection and the
              confirmation, the confirmation is rejected — so you can never
              approve one thing and have another happen.
            </p>
          </RefCard>

          <RefCard title="Scripts and CI" icon={Terminal}>
            <p className="text-sm text-muted-foreground">
              Cron and CI have no browser, so they cannot do the sign-in flow.
              Create a machine client in{' '}
              <Link
                href="/admin/settings"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Settings &rarr; Connections
              </Link>
              , then trade the secret for a token:
            </p>
            <CopyBlock code={CI_CURL} label="terminal" />
            <p className="text-sm text-muted-foreground">
              Machine clients are scoped like any other connection, so a nightly
              sync can be given reading only and then cannot email anyone.
            </p>
          </RefCard>

          <RefCard title="What Cursor can do" icon={Eye} className="lg:col-span-2">
            <div className="grid min-w-0 gap-x-10 gap-y-6 sm:grid-cols-2">
              <ToolList label="Reading" tools={READ_TOOLS} />
              <ToolList label="Changing things" tools={WRITE_TOOLS} />
            </div>
            <p className="text-sm text-muted-foreground">
              These are the two permissions you approve when connecting. Granting
              only reading gives you a safe, read-only console.
            </p>
          </RefCard>

          <RefCard
            title="If something goes wrong"
            icon={PencilLine}
            className="lg:col-span-2"
          >
            <dl className="grid gap-x-10 sm:grid-cols-2">
              {[
                [
                  'Clicking Connect does nothing',
                  <>
                    Check the URL ends in <code className="font-code">/api/mcp</code>{' '}
                    and is reachable from your machine. Visiting{' '}
                    <code className="font-code">
                      /.well-known/oauth-protected-resource/api/mcp
                    </code>{' '}
                    should return JSON.
                  </>,
                ],
                [
                  '“The access token was not issued for this server”',
                  <>
                    The deployment sits behind a proxy that strips forwarding
                    headers, so it cannot tell what its own public URL is. Set{' '}
                    <code className="font-code">PUBLIC_URL</code> to the public
                    origin and redeploy.
                  </>,
                ],
                [
                  'A tool says it lacks write permission',
                  <>
                    The connection was approved for reading only. Reconnect from
                    Cursor and approve both permissions.
                  </>,
                ],
                [
                  'Cursor picks the wrong tool',
                  <>
                    Be concrete — name the city and the date. If it keeps
                    happening the fix belongs in the tool&apos;s description in{' '}
                    <code className="font-code">src/lib/mcp/tools-*.ts</code>,
                    since that text is what the model actually reads.
                  </>,
                ],
              ].map(([term, def], i) => (
                <div key={i} className="space-y-1 py-3">
                  <dt className="text-sm font-medium">{term}</dt>
                  <dd className="text-sm text-muted-foreground">{def}</dd>
                </div>
              ))}
            </dl>
          </RefCard>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6">
        <Link
          href="/docs/deploy"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Terminal className="size-4" /> Deploy your own
        </Link>
        <Link
          href="/docs/resend"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Mail className="size-4" /> Email setup
        </Link>
      </div>
    </div>
  )
}
