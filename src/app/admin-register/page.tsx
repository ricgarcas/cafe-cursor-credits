'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Loader2 } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'
import { EnterKeyHint } from '@/components/ui/enter-key-hint'

const schema = z.object({
  name: z.string().min(1, 'Required').max(255),
  email: z.string().email('Enter a valid email').max(255),
  password: z.string().min(6, 'At least 6 characters'),
})

type FormValues = z.infer<typeof schema>

export default function AdminRegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: '', email: '', password: '' },
  })

  const onSubmit = async (data: FormValues) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Registration failed')
        setLoading(false)
        return
      }
      router.push(json.redirect || '/admin/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <PublicShell
      title="Create admin"
      tagline="First-admin bootstrap. You'll be signed in automatically."
    >
      <Card>
        <CardContent>
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
                    <FormLabel>Name</FormLabel>
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
                    <FormControl><Input type="email" placeholder="ben@cursor.com" autoComplete="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl><Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={loading || !form.formState.isValid}
                size="lg"
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    Create admin account
                    <EnterKeyHint />
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-[color:var(--brand-orange)] hover:underline underline-offset-4">
          Sign in →
        </Link>
      </p>
    </PublicShell>
  )
}
