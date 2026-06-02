'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Loader2, Check, Copy, Mail, Sparkles, ExternalLink } from 'lucide-react'
import { PublicShell, usePublicSettings } from '@/components/public/shell'
import { toast } from 'sonner'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Enter a valid email').max(255),
})
type FormValues = z.infer<typeof schema>

type ClaimResult =
  | { code: string; alreadyClaimed?: boolean; outOfCodes?: false }
  | { code: null; outOfCodes: true }

export default function ClaimPage() {
  const settings = usePublicSettings()
  const [loading, setLoading] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '' },
  })

  const onSubmit = async (data: FormValues) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, sendEmail: false }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Could not claim a code')
      } else if (json.outOfCodes) {
        setResult({ code: null, outOfCodes: true })
      } else {
        setResult({ code: json.code, alreadyClaimed: json.alreadyClaimed })
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!result || result.code == null) return
    await navigator.clipboard.writeText(result.code)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const emailMe = async () => {
    const data = form.getValues()
    if (!data.email) return
    setSendingEmail(true)
    try {
      await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, sendEmail: true }),
      })
      setEmailSent(true)
      toast.success('Email sent (if configured)')
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <PublicShell
      title="Grab your credits"
      tagline={result ? undefined : 'Enter your details and we’ll hand you a code on the spot.'}
    >
      {result && result.code ? (
        <Card className="bg-card">
          <CardContent className="py-4 flex flex-col gap-5">
            <div className="flex items-center justify-center gap-2 text-[color:var(--brand-green)] text-sm">
              <Sparkles className="size-4" />
              {result.alreadyClaimed ? 'You already claimed one — here it is.' : 'Code unlocked.'}
            </div>

            <div className="rounded-[14px] border border-border bg-background/60 p-5 flex flex-col gap-3">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Your Cursor credit code
              </span>
              <div className="font-code text-xl md:text-2xl break-all select-all tracking-[0.01em]">
                {result.code}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={copy} variant="outline" size="sm">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button asChild variant="brandFilled" size="sm">
                  <a
                    href={result.code.startsWith('http') ? result.code : `https://cursor.com/referral?code=${encodeURIComponent(result.code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    Redeem
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={emailMe}
                  disabled={sendingEmail || emailSent}
                >
                  {sendingEmail ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : emailSent ? (
                    <Check className="size-4" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  {emailSent ? 'Emailed' : 'Email me a copy'}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Save this somewhere safe — codes are one-time use.
            </p>
          </CardContent>
        </Card>
      ) : result && result.outOfCodes ? (
        <Card>
          <CardContent className="py-6 text-center space-y-2">
            <p className="font-medium">We&apos;re out of codes for now.</p>
            <p className="text-sm text-muted-foreground">
              You&apos;re registered — ask an organizer or try again in a few minutes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl><Input placeholder="Ben Lang" autoComplete="name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" placeholder="you@domain.com" autoComplete="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={loading} size="lg" className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Unlocking…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" /> Show my code
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </PublicShell>
  )
}
