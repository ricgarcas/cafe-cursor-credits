'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [emailConfigured, setEmailConfigured] = useState(true)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json().catch(() => ({}))
      setEmailConfigured(json.email_configured !== false)
      setMessage(json.message || 'If that account exists, a reset link is on its way.')
    } catch {
      setMessage('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell title="Reset password" tagline="We'll email you a one-time reset link.">
      <Card>
        <CardContent>
          {message ? (
            <div className="space-y-3 py-2">
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              {!emailConfigured && (
                <p className="text-sm text-muted-foreground">
                  Email isn&apos;t configured on this deployment. Ask another admin, or run{' '}
                  <code className="font-code">npm run reset-password -- you@email.com</code> on the server.
                </p>
              )}
              <p className="text-center text-sm">
                <a href="/login" className="underline underline-offset-4">Back to sign in</a>
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" disabled={loading} size="lg" className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sending…
                  </>
                ) : (
                  'Send reset link'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PublicShell>
  )
}
