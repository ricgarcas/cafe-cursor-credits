'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Loader2, Save, Check, ChevronsUpDown, Eye, EyeOff, Pencil, Lock, MapPin, Ticket, Mail, CalendarDays, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { UNCHANGED } from '@/lib/secrets'
import { DateField } from '@/components/ui/date-field'
import { ConnectionsManager } from '@/components/admin/connections-manager'

// Canonical timezone list — no duplicates, Mexico City first.
const TIMEZONES = [
  { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
  { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Bogota', label: 'Bogotá (COT)' },
  { value: 'America/Lima', label: 'Lima (PET)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET/WEST)' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'Mumbai / Delhi (IST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

const schema = z.object({
  city_name: z.string().min(1).max(255),
  country: z.string().max(100).nullable().optional(),
  timezone: z.string().min(1),
  language: z.string().min(2).max(10),
  event_tagline: z.string().max(255).nullable().optional(),
  event_date: z.string().max(64).nullable().optional(),
  claim_enabled: z.boolean(),
  email_provider: z.enum(['resend', 'smtp']),
  resend_api_key: z.string().nullable().optional(),
  from_email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  smtp_host: z.string().nullable().optional(),
  smtp_port: z.number().int().positive().max(65535).nullable().optional(),
  smtp_secure: z.boolean().optional(),
  smtp_user: z.string().nullable().optional(),
  smtp_password: z.string().nullable().optional(),
  luma_api_key: z.string().nullable().optional(),
  luma_calendar_id: z.string().max(100).nullable().optional(),
})
type FormValues = z.infer<typeof schema>

const SECTIONS = [
  { id: 'general', label: 'General', icon: MapPin },
  { id: 'claim', label: 'Claim portal', icon: Ticket },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'luma', label: 'Luma', icon: CalendarDays },
  { id: 'api', label: 'API keys', icon: KeyRound },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/admin/send-test-email', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Send failed')
      toast.success(`Test email sent to ${json.to}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setTesting(false)
    }
  }
  const [tzOpen, setTzOpen] = useState(false)
  const [section, setSection] = useState<SectionId>('general')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      city_name: '',
      country: '',
      timezone: 'America/Mexico_City',
      language: 'en',
      event_tagline: '',
      event_date: '',
      claim_enabled: true,
      email_provider: 'resend',
      resend_api_key: '',
      from_email: '',
      smtp_host: '',
      smtp_port: null,
      smtp_secure: false,
      smtp_user: '',
      smtp_password: '',
      luma_api_key: '',
      luma_calendar_id: '',
    },
  })

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((s) => {
        form.reset({
          city_name: s.city_name ?? '',
          country: s.country ?? '',
          timezone: s.timezone ?? 'America/Mexico_City',
          language: s.language ?? 'en',
          event_tagline: s.event_tagline ?? '',
          event_date: s.event_date ?? '',
          claim_enabled: s.claim_enabled ?? true,
          email_provider: s.email_provider ?? 'resend',
          // Secrets: if set, seed with sentinel so the form knows not to overwrite.
          resend_api_key: s.resend_api_key_set ? UNCHANGED : '',
          from_email: s.from_email ?? '',
          smtp_host: s.smtp_host ?? '',
          smtp_port: s.smtp_port ?? null,
          smtp_secure: s.smtp_secure ?? false,
          smtp_user: s.smtp_user ?? '',
          smtp_password: s.smtp_password_set ? UNCHANGED : '',
          luma_api_key: s.luma_api_key_set ? UNCHANGED : '',
          luma_calendar_id: s.luma_calendar_id ?? '',
        })
        setMasks({
          resend: s.resend_api_key_masked ?? '',
          smtp: s.smtp_password_masked ?? '',
          luma: s.luma_api_key_masked ?? '',
        })
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [form])

  const [masks, setMasks] = useState<{ resend: string; smtp: string; luma: string }>({ resend: '', smtp: '', luma: '' })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed')
      // Reload to pick up fresh masked previews if the key changed.
      const refreshed = await res.json()
      form.setValue(
        'resend_api_key',
        refreshed.resend_api_key_set ? UNCHANGED : '',
      )
      form.setValue('luma_api_key', refreshed.luma_api_key_set ? UNCHANGED : '')
      form.setValue('smtp_password', refreshed.smtp_password_set ? UNCHANGED : '')
      setMasks({
        resend: refreshed.resend_api_key_masked ?? '',
        smtp: refreshed.smtp_password_masked ?? '',
        luma: refreshed.luma_api_key_masked ?? '',
      })
      toast.success('Settings saved')
    } catch {
      toast.error('Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          City identity, branding, and integration API keys.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col md:flex-row md:items-start gap-6"
        >
          <nav className="md:w-48 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-full px-4 py-2 text-sm transition-colors shrink-0 text-left',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {s.label}
                </button>
              )
            })}
          </nav>

          <div className="flex-1 min-w-0 space-y-6">
          <Card className={cn(section !== 'general' && 'hidden')}>
            <CardHeader>
              <CardTitle>City</CardTitle>
              <CardDescription>Displayed throughout your deployment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="city_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground font-tagline text-[15px] shrink-0">
                        Cafe Cursor
                      </span>
                      <FormControl>
                        <Input placeholder="Mexico City" {...field} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Mexico" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                            type="button"
                            variant="outline"
                            shape="rounded"
                            role="combobox"
                            className={cn(
                              'w-full justify-between font-normal',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            {TIMEZONES.find((tz) => tz.value === field.value)?.label || 'Select timezone…'}
                            <ChevronsUpDown className="size-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
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
                                  <Check
                                    className={cn(
                                      'mr-2 size-4',
                                      field.value === tz.value ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
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
                name="event_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event date</FormLabel>
                    <FormControl>
                      <DateField
                        id="event-date"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Pick the date of this edition"
                      />
                    </FormControl>
                    <FormDescription>
                      Applies to the event selected in the sidebar — what tells
                      one Cafe Cursor edition from the next.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="event_tagline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tagline</FormLabel>
                    <FormControl>
                      <Input placeholder="Builders, coffee, and good vibes." {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Shown on public pages.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className={cn(section !== 'claim' && 'hidden')}>
            <CardHeader>
              <CardTitle>Claim portal</CardTitle>
              <CardDescription>
                The public <span className="font-code">/claim</span> page where attendees self-serve a code on the spot.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="claim_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 space-y-0">
                    <div>
                      <FormLabel>Accept claims</FormLabel>
                      <FormDescription>
                        Turn off to close the portal — visitors see a “closed” message and codes can’t be claimed.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className={cn(section !== 'email' && 'hidden')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-5" /> Email
              </CardTitle>
              <CardDescription>
                Used to send credit-code emails. Keys are stored locally — once saved they&apos;re never sent back to the browser, you&apos;ll only see a masked preview.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="email_provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email provider</FormLabel>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'resend', label: 'Resend', hint: 'Free 3k/mo, verified domain.' },
                        { value: 'smtp', label: 'Gmail / SMTP', hint: 'Use your own Gmail (App Password).' },
                      ].map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => {
                            field.onChange(p.value)
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
                      Guides:{' '}
                      <a href="/docs/resend" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">Resend</a>
                      {' '}·{' '}
                      <a href="/docs/gmail" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">Gmail SMTP</a>
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
                      <SecretField
                        label="Resend API key"
                        placeholder="re_…"
                        field={field}
                        masked={masks.resend}
                        onClear={() => setMasks((m) => ({ ...m, resend: '' }))}
                        description={
                          <>
                            Required for sending credit-code emails.{' '}
                            <a
                              href="/docs/resend"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-4 hover:text-foreground"
                            >
                              Full setup guide →
                            </a>
                          </>
                        }
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="from_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="hello@yourdomain.com" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormDescription>Must be verified in Resend. Defaults to the sandbox sender if unset.</FormDescription>
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
                          <a href="/docs/gmail" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
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
                      <SecretField
                        label="App password"
                        placeholder="16-char App Password (not your Gmail password)"
                        field={field}
                        masked={masks.smtp}
                        onClear={() => setMasks((m) => ({ ...m, smtp: '' }))}
                        description={<>Generate at Google Account → Security → App passwords.</>}
                      />
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="smtp_host"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
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
                  <FormField
                    control={form.control}
                    name="from_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From email <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="hello@yourdomain.com" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormDescription>Defaults to the Gmail address above if unset.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <div className="flex items-center justify-between gap-4 rounded-[12px] border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Test your setup</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sends a test message to your own email using the saved settings.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={sendTest} disabled={testing}>
                  {testing ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Send test
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(section !== 'luma' && 'hidden')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-5" /> Luma
              </CardTitle>
              <CardDescription>
                Connect a Luma calendar to sync guests. Optional — only needed if you run events on Luma.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="luma_api_key"
                render={({ field }) => (
                  <SecretField
                    label="Luma API key"
                    placeholder="secret-…"
                    field={field}
                    masked={masks.luma}
                    onClear={() => setMasks((m) => ({ ...m, luma: '' }))}
                    description={
                      <>
                        From your Luma calendar: <span className="font-medium">Settings → Developer → API Keys</span>.
                      </>
                    }
                  />
                )}
              />
              <FormField
                control={form.control}
                name="luma_calendar_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Luma Calendar ID <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="cal-…" {...field} value={field.value ?? ''} className="font-code" />
                    </FormControl>
                    <FormDescription>
                      Shown at the bottom of the Developer settings page. Only needed if your key has access to multiple calendars.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className={cn(section !== 'api' && 'hidden')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5" /> Connections
              </CardTitle>
              <CardDescription>
                Apps connected to this deployment over MCP. Cursor signs in with your admin
                account — no key to copy. Revoking cuts access immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectionsManager />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="size-4" /> Save settings
                </>
              )}
            </Button>
          </div>
          </div>
        </form>
      </Form>
    </div>
  )
}

/**
 * Three-state secret input:
 *  - unset: plain password field
 *  - set (server has a value): shows masked preview, locked, with "Change" button
 *  - changing: back to a plain password field, with an eye toggle
 */
function SecretField({
  label,
  placeholder,
  field,
  masked,
  description,
  onClear,
}: {
  label: string
  placeholder: string
  field: { value?: string | null; onChange: (v: string) => void; onBlur: () => void; name: string }
  masked: string
  description: React.ReactNode
  onClear: () => void
}) {
  const [reveal, setReveal] = useState(false)
  const isUnchanged = field.value === UNCHANGED
  const hasSaved = Boolean(masked)

  if (isUnchanged && hasSaved) {
    return (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-full border border-border bg-muted/40 font-code text-sm">
            <Lock className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{masked}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              field.onChange('')
              onClear()
            }}
          >
            <Pencil className="size-3.5" /> Change
          </Button>
        </div>
        <FormDescription>{description}</FormDescription>
        <FormMessage />
      </FormItem>
    )
  }

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <div className="relative">
        <FormControl>
          <Input
            type={reveal ? 'text' : 'password'}
            placeholder={placeholder}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            name={field.name}
            className="pr-10 font-code"
            autoComplete="off"
          />
        </FormControl>
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setReveal((v) => !v)}
          tabIndex={-1}
        >
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <FormDescription>{description}</FormDescription>
      <FormMessage />
    </FormItem>
  )
}
