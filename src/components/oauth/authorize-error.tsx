import { ShieldAlert } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Rendered, never redirected. When the client or redirect URI cannot be
 * verified there is no trustworthy place to send the user, and bouncing them
 * anyway would make this an open redirector.
 */
export function AuthorizeError({ message }: { message: string }) {
  return (
    <PublicShell
      eyebrow="Authorization"
      title="Can't connect this app"
      tagline="Nothing was approved and no access was granted."
    >
      <Card>
        <CardContent className="space-y-4 py-2">
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Close this tab and start the connection again from Cursor. If it keeps
            failing, check that the server URL in your MCP settings matches this
            deployment exactly.
          </p>
        </CardContent>
      </Card>
    </PublicShell>
  )
}
