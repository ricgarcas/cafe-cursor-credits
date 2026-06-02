'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { CursorCube } from '@/components/brand/logo'
import { PublicBackdrop } from '@/components/public/backdrop'
import { ThemeToggle } from '@/components/theme-toggle'
import { EnterKeyHint } from '@/components/ui/enter-key-hint'
import { ArrowLeft, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TIMEZONES = [
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
  { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'America/Bogota', label: 'Bogotá (COT)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'Mumbai / Delhi (IST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
]

const EMAIL_PROVIDERS = [
  { value: 'resend' as const, label: 'Resend', hint: 'Free 3k/month, verified domain.' },
  { value: 'smtp' as const, label: 'Gmail / SMTP', hint: 'Use your own Gmail (App Password).' },
]

const DEPLOY_HOSTS = [
  { value: 'railway' as const, label: 'Railway', hint: 'Recommended for non-devs. One-click deploy with a persistent SQLite volume.' },
  { value: 'vercel' as const, label: 'Vercel + Turso', hint: 'Serverless + hosted libSQL. Great free tier.' },
  { value: 'fly' as const, label: 'Fly.io', hint: 'SQLite + Litestream for hardcore durability.' },
  { value: 'self' as const, label: 'Self-hosted', hint: 'VPS, Docker, or anywhere Node 20+ runs.' },
]

const schema = z.object({
  city_name: z.string().min(1, 'City is required').max(255),
  country: z.string().max(100).optional().nullable(),
  timezone: z.string().min(1),
  language: z.string().min(2).max(10),
  event_tagline: z.string().max(255).optional().nullable(),
  email_provider: z.enum(['resend', 'smtp']),
  resend_api_key: z.string().optional().nullable(),
  from_email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.number().int().positive().max(65535).optional().nullable(),
  smtp_secure: z.boolean().optional(),
  smtp_user: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
  deploy_host: z.enum(['railway', 'vercel', 'fly', 'self']).optional(),
  // Admin account (last step). Password stays optional — empty = no change.
  admin_name: z.string().min(1, 'Required').max(255),
  admin_email: z.string().email('Enter a valid email').max(255),
  admin_password: z.union([z.literal(''), z.string().min(6, 'At least 6 characters')]).optional(),
})

type FormValues = z.infer<typeof schema>

const STEPS = [
  { id: 'city', title: 'Your city', subtitle: "Let's set up where you're running Cafe Cursor." },
  { id: 'locale', title: 'Localization', subtitle: 'Pick your timezone and language.' },
  { id: 'email', title: 'Email delivery', subtitle: 'Pick a provider so attendees get their codes by email.' },
  { id: 'deploy', title: 'Hosting', subtitle: 'Where are you running Cafe Cursor? We\'ll link the matching guide.' },
  { id: 'account', title: 'Your account', subtitle: 'Double-check your admin details. Change anything if you like.' },
] as const

export function OnboardingWizard({ initial }: { initial: Partial<FormValues> }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [tzOpen, setTzOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // Don't pre-fill the default seed value — show the placeholder instead.
      city_name: initial.city_name && initial.city_name !== 'Cafe Cursor' ? initial.city_name : '',
      country: initial.country || '',
      timezone: initial.timezone || 'America/Mexico_City',
      language: initial.language || 'en',
      event_tagline: initial.event_tagline || '',
      email_provider: initial.email_provider || 'resend',
      resend_api_key: initial.resend_api_key || '',
      from_email: initial.from_email || '',
      smtp_host: initial.smtp_host || '',
      smtp_port: initial.smtp_port ?? null,
      smtp_secure: initial.smtp_secure ?? false,
      smtp_user: initial.smtp_user || '',
      smtp_password: initial.smtp_password || '',
      deploy_host: initial.deploy_host,
      admin_name: initial.admin_name || '',
      admin_email: initial.admin_email || '',
      admin_password: '',
    },
  })

  const next = async () => {
    const fieldsByStep: Record<number, (keyof FormValues)[]> = {
      0: ['city_name', 'country'],
      1: ['timezone', 'language'],
      2: ['email_provider', 'resend_api_key', 'from_email', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'],
      3: ['deploy_host'],
      4: ['admin_name', 'admin_email', 'admin_password'],
    }
    const ok = await form.trigger(fieldsByStep[step])
    if (!ok) return
    if (step < STEPS.length - 1) setStep(step + 1)
    else submit()
  }

  const prev = () => setStep(Math.max(0, step - 1))

  const submit = () => {
    const values = form.getValues()
    // Split wizard-only + admin-account fields out; the settings endpoint
    // only wants app config, and /api/auth/me owns the user row.
    const {
      deploy_host: _deployHost,
      admin_name,
      admin_email,
      admin_password,
      ...persisted
    } = values
    void _deployHost
    startTransition(async () => {
      try {
        const settingsRes = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...persisted, onboarded: true }),
        })
        if (!settingsRes.ok) throw new Error('settings failed')

        const accountRes = await fetch('/api/auth/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: admin_name,
            email: admin_email,
            password: admin_password || '',
          }),
        })
        if (!accountRes.ok) {
          const body = await accountRes.json().catch(() => ({}))
          throw new Error(body.error || 'account failed')
        }

        toast.success('All set! Welcome to Cafe Cursor.')
        router.push('/admin/dashboard')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : 'Could not save. Please try again.')
      }
    })
  }

  const current = STEPS[step]

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground">
      <PublicBackdrop />

      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 md:px-8 py-12 md:py-20">
        <div className="w-full max-w-xl">
          {/* Progress pills */}
          <div className="flex items-center gap-2 mb-10">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= step ? 'bg-foreground' : 'bg-border',
                )}
              />
            ))}
          </div>

          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl leading-tight">
              {current.title}
            </h1>
            <p className="mt-1 text-muted-foreground text-[17px]">{current.subtitle}</p>
          </div>

          <Card className="bg-card">
            <CardContent>
              <Form {...form}>
                <form
                  className="space-y-5"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const t = e.target as HTMLElement
                    // Let multi-line inputs, comboboxes, and open popovers keep Enter.
                    if (t.tagName === 'TEXTAREA') return
                    if (t.getAttribute('role') === 'combobox') return
                    if (t.closest('[cmdk-root]')) return
                    e.preventDefault()
                    if (!isPending) next()
                  }}
                >
                  {step === 0 && (
                    <>
                      <FormField
                        control={form.control}
                        name="city_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground font-tagline text-[15px] shrink-0">Cafe Cursor</span>
                              <FormControl>
                                <Input placeholder="Mexico City" {...field} />
                              </FormControl>
                            </div>
                            <FormDescription>
                              Just the city name — we&apos;ll prefix it with &quot;Cafe Cursor&quot; everywhere.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                            <FormControl>
                              <Input placeholder="Mexico" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="event_tagline"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tagline <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                            <FormControl>
                              <Input placeholder="Builders, coffee, and good vibes." {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormDescription>Shown under the title on your public page.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {step === 1 && (
                    <>
                      <FormField
                        control={form.control}
                        name="timezone"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Timezone</FormLabel>
                            <Popover open={tzOpen} onOpenChange={setTzOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    shape="rounded"
                                    role="combobox"
                                    aria-expanded={tzOpen}
                                    className="w-full justify-between font-normal"
                                  >
                                    {TIMEZONES.find((tz) => tz.value === field.value)?.label || 'Select timezone…'}
                                    <ChevronsUpDown className="size-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-[min(420px,92vw)] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search timezone…" />
                                  <CommandList>
                                    <CommandEmpty>No timezone found.</CommandEmpty>
                                    <CommandGroup>
                                      {TIMEZONES.map((tz) => (
                                        <CommandItem
                                          key={tz.value}
                                          value={tz.label}
                                          onSelect={() => {
                                            field.onChange(tz.value)
                                            setTzOpen(false)
                                          }}
                                        >
                                          <Check className={cn('mr-2 size-4', field.value === tz.value ? 'opacity-100' : 'opacity-0')} />
                                          {tz.label}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Language</FormLabel>
                            <div className="flex flex-wrap gap-2">
                              {LANGUAGES.map((l) => (
                                <button
                                  key={l.value}
                                  type="button"
                                  onClick={() => field.onChange(l.value)}
                                  className={cn(
                                    'h-9 px-4 rounded-full text-sm border transition-colors',
                                    field.value === l.value
                                      ? 'bg-foreground text-background border-foreground'
                                      : 'bg-transparent text-foreground border-border hover:bg-muted',
                                  )}
                                >
                                  {l.label}
                                </button>
                              ))}
                            </div>
                            <FormDescription>Used for public-facing copy. (UI remains English for now.)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <FormField
                        control={form.control}
                        name="email_provider"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Provider</FormLabel>
                            <div className="grid grid-cols-2 gap-3">
                              {EMAIL_PROVIDERS.map((p) => (
                                <button
                                  key={p.value}
                                  type="button"
                                  onClick={() => {
                                    field.onChange(p.value)
                                    // Gmail preset: auto-fill host/port on switch.
                                    if (p.value === 'smtp' && !form.getValues('smtp_host')) {
                                      form.setValue('smtp_host', 'smtp.gmail.com')
                                      form.setValue('smtp_port', 587)
                                      form.setValue('smtp_secure', false)
                                    }
                                  }}
                                  className={cn(
                                    'h-auto px-4 py-3 rounded-[12px] text-left border transition-colors',
                                    field.value === p.value
                                      ? 'bg-foreground text-background border-foreground'
                                      : 'bg-transparent border-border hover:bg-muted',
                                  )}
                                >
                                  <div className="font-medium text-sm">{p.label}</div>
                                  <div className={cn(
                                    'text-xs mt-0.5',
                                    field.value === p.value ? 'text-background/70' : 'text-muted-foreground',
                                  )}>
                                    {p.hint}
                                  </div>
                                </button>
                              ))}
                            </div>
                            <FormDescription>
                              Pick your delivery method. Guides:{' '}
                              <a href="/docs/resend" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                                Resend
                              </a>{' '}·{' '}
                              <a href="/docs/gmail" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                                Gmail SMTP
                              </a>
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch('email_provider') === 'resend' && (
                        <>
                          <FormField
                            control={form.control}
                            name="resend_api_key"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Resend API key <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="re_…" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormDescription>
                                  Three-thousand free emails/month.{' '}
                                  <a href="/docs/resend" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                                    Full setup guide →
                                  </a>
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="from_email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>From email <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="hello@yourdomain.com" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormDescription>Must be verified in Resend. Defaults to noreply if unset.</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {form.watch('email_provider') === 'smtp' && (
                        <>
                          <FormField
                            control={form.control}
                            name="smtp_user"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email address</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="you@gmail.com" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormDescription>
                                  The Gmail account that will send the messages.{' '}
                                  <a href="/docs/gmail" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                                    How to get an App Password →
                                  </a>
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="smtp_password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>App password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="16-char App Password (not your Gmail password)" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormDescription>Generate at Google Account → Security → App passwords.</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="smtp_host"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>SMTP host</FormLabel>
                                  <FormControl>
                                    <Input placeholder="smtp.gmail.com" {...field} value={field.value ?? ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="smtp_port"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Port</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="587"
                                      value={field.value ?? ''}
                                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {step === 3 && (
                    <FormField
                      control={form.control}
                      name="deploy_host"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Where are you hosting?</FormLabel>
                          <div className="grid grid-cols-1 gap-3">
                            {DEPLOY_HOSTS.map((h) => (
                              <button
                                key={h.value}
                                type="button"
                                onClick={() => field.onChange(h.value)}
                                className={cn(
                                  'h-auto px-4 py-3 rounded-[12px] text-left border transition-colors',
                                  field.value === h.value
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-transparent border-border hover:bg-muted',
                                )}
                              >
                                <div className="font-medium text-sm">{h.label}</div>
                                <div className={cn(
                                  'text-xs mt-0.5',
                                  field.value === h.value ? 'text-background/70' : 'text-muted-foreground',
                                )}>
                                  {h.hint}
                                </div>
                              </button>
                            ))}
                          </div>
                          <FormDescription>
                            We&apos;ll point you at the right guide.{' '}
                            <a href="/docs/deploy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                              All deploy options →
                            </a>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {step === 4 && (
                    <>
                      <FormField
                        control={form.control}
                        name="admin_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Ben Lang" autoComplete="name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="admin_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="ben@cursor.com" autoComplete="email" {...field} />
                            </FormControl>
                            <FormDescription>You&apos;ll sign in with this address.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="admin_password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              New password <span className="text-muted-foreground font-normal">(optional)</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Leave blank to keep current password"
                                autoComplete="new-password"
                                {...field}
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormDescription>Minimum 6 characters. Only set this if you want to change it.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="mt-6 flex items-center justify-between gap-4">
            <Button type="button" variant="ghost" onClick={prev} disabled={step === 0 || isPending}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <p className="text-muted-foreground text-xs text-center flex-1 min-w-0">
              You can change any of this later in Settings.
            </p>
            <Button type="button" onClick={next} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : step === STEPS.length - 1 ? (
                <>
                  Finish setup
                  <EnterKeyHint />
                </>
              ) : (
                <>
                  Continue
                  <EnterKeyHint />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <footer className="py-8 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <a
          href="https://cursor.com"
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Cursor"
        >
          <CursorCube className="size-5" />
        </a>
        <span>
          Built for the{' '}
          <a
            href="https://cursor.com/ambassadors"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline hover:text-foreground"
          >
            Cursor Ambassador Community
          </a>
          .
        </span>
      </footer>
    </div>
  )
}
