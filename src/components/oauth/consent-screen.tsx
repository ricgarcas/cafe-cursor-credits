'use client'

import { useState } from 'react'
import { Eye, Loader2, PencilLine, ShieldAlert, Plug } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SCOPE_READ, SCOPE_WRITE } from '@/lib/oauth/config'

/** Plain-language scope copy. "cafecursor:write" means nothing to a human. */
const SCOPE_COPY: Record<string, { title: string; detail: string; icon: typeof Eye }> = {
  [SCOPE_READ]: {
    title: 'Read your event data',
    detail: 'Attendees, code counts, check-in status, and setup readiness.',
    icon: Eye,
  },
  [SCOPE_WRITE]: {
    title: 'Set up events and send credit codes',
    detail: 'Create events, import codes, and email attendees on your behalf.',
    icon: PencilLine,
  },
}

export function ConsentScreen({
  clientName,
  isNewClient,
  scope,
  resource,
  userEmail,
  params,
}: {
  clientName: string
  isNewClient: boolean
  scope: string
  resource: string
  userEmail: string
  params: string
}) {
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null)
  const scopes = scope.split(' ').filter(Boolean)

  const submit = (decision: 'approve' | 'deny') => {
    setBusy(decision)
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/api/oauth/consent?${params}`
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'decision'
    input.value = decision
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <PublicShell
      eyebrow="Authorization"
      title={`Connect ${clientName}?`}
      tagline={`Signed in as ${userEmail}`}
    >
      <Card>
        <CardContent className="space-y-6 py-2">
          <div className="flex items-center gap-3 rounded-[10px] border border-border bg-muted/40 p-3">
            <Plug className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{clientName}</p>
              <p className="truncate font-code text-xs text-muted-foreground">{resource}</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              This will be able to
            </p>
            {scopes.map((s) => {
              const copy = SCOPE_COPY[s]
              if (!copy) return null
              const Icon = copy.icon
              return (
                <div key={s} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-tight">{copy.title}</p>
                    <p className="text-sm text-muted-foreground">{copy.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {isNewClient && (
            <Alert>
              <ShieldAlert className="size-4" />
              <AlertDescription>
                This app registered itself just now and has never been approved before.
                Only continue if you started this from Cursor yourself.
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            Sending codes still asks you to confirm each time — approving here does not
            let it email anyone without showing you the numbers first.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => submit('deny')}
              disabled={busy !== null}
            >
              {busy === 'deny' && <Loader2 className="size-4 animate-spin" />}
              Cancel
            </Button>
            <Button shape="pill" onClick={() => submit('approve')} disabled={busy !== null}>
              {busy === 'approve' && <Loader2 className="size-4 animate-spin" />}
              Approve
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            You can revoke this anytime in Settings &rarr; Connections.
          </p>
        </CardContent>
      </Card>
    </PublicShell>
  )
}
