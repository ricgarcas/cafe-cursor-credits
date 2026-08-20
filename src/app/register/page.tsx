'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Loader2, CheckCircle2, Mail } from 'lucide-react'
import { PublicShell, usePublicSettings } from '@/components/public/shell'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Enter a valid email').max(255),
})
type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const settings = usePublicSettings()
  const [result, setResult] = useState<{ success: boolean; couponAssigned: boolean; emailStatus: 'sent' | 'failed' | 'skipped' | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '' },
  })

  const onSubmit = async (data: FormValues) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Registration failed')
      } else {
        setResult(json)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const city = settings.city_name && settings.city_name !== 'Cafe Cursor' ? settings.city_name : null
  return (
    <PublicShell
      title={
        city ? (
          <>
            Cafe Cursor
            <span className="block">{city}</span>
          </>
        ) : (
          'Cafe Cursor'
        )
      }
      tagline={settings.event_tagline ?? 'Builders, coffee, and good vibes.'}
    >
      <Card>
        <CardContent className="pt-2">
          {result ? (
            <div className="flex flex-col gap-5 py-2">
              <div className="flex items-start gap-3 rounded-[10px] border border-[color:var(--brand-green)]/30 bg-[color:var(--brand-green-soft)] px-4 py-3">
                <CheckCircle2 className="size-5 text-[color:var(--brand-green)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">You&apos;re in.</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {result.couponAssigned && result.emailStatus === 'sent'
                      ? 'Check your email for your Cursor credit code.'
                      : result.couponAssigned
                        ? 'A code is reserved for you — the organizers will get it to you shortly.'
                        : 'You’re registered. Credits will be emailed when available.'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null)
                  form.reset()
                }}
              >
                Register another
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
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
                      <FormControl>
                        <Input placeholder="Ben Lang" autoComplete="name" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Input type="email" placeholder="you@domain.com" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={loading} size="lg" className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Registering…
                    </>
                  ) : (
                    <>
                      <Mail className="size-4" /> Register &amp; email my code
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        At the event? <Link href="/claim" className="text-[color:var(--brand-orange)] hover:underline underline-offset-4">Claim your code instantly →</Link>
      </p>
    </PublicShell>
  )
}
