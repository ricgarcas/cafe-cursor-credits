'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Loader2, Save, Settings, Sparkles, Check, ChevronsUpDown, Eye, EyeOff, Key } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types/database'

const settingsSchema = z.object({
  city_name: z.string().min(1, 'City name is required').max(255),
  timezone: z.string().min(1, 'Timezone is required'),
  luma_api_key: z.string().nullable().optional(),
  resend_api_key: z.string().nullable().optional(),
})

type SettingsFormData = z.infer<typeof settingsSchema>

// Common timezones - sorted alphabetically by label
const TIMEZONES = [
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Athens', label: 'Athens (EET/EEST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
  { value: 'Asia/Makassar', label: 'Bali (WITA)' },
  { value: 'Asia/Bangkok', label: 'Bangkok / Chiang Mai (ICT)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'America/Bogota', label: 'Bogotá (COT)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)' },
  { value: 'Africa/Casablanca', label: 'Casablanca (WET)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'Asia/Dhaka', label: 'Dhaka (BST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'America/Edmonton', label: 'Edmonton (MST/MDT)' },
  { value: 'America/Halifax', label: 'Halifax (AST/ADT)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City (ICT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Pacific/Honolulu', label: 'Honolulu (HST)' },
  { value: 'Asia/Istanbul', label: 'Istanbul (TRT)' },
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (NPT)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (MYT)' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT)' },
  { value: 'America/Lima', label: 'Lima (PET)' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET/WEST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Asia/Manila', label: 'Manila (PHT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
  { value: 'America/Montreal', label: 'Montreal (EST/EDT)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Asia/Kolkata', label: 'Mumbai / Delhi (IST)' },
  { value: 'Africa/Nairobi', label: 'Nairobi (EAT)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'America/Phoenix', label: 'Phoenix (MST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai / Beijing (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'America/St_Johns', label: "St. John's (NST/NDT)" },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Asia/Taipei', label: 'Taipei (CST)' },
  { value: 'Asia/Tel_Aviv', label: 'Tel Aviv (IST/IDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
  { value: 'America/Vancouver', label: 'Vancouver (PST/PDT)' },
  { value: 'America/Winnipeg', label: 'Winnipeg (CST/CDT)' },
  { value: 'Europe/Zurich', label: 'Zurich (CET/CEST)' },
]

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const isSetupMode = searchParams.get('setup') === 'true'
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [showLumaKey, setShowLumaKey] = useState(false)
  const [showResendKey, setShowResendKey] = useState(false)

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      city_name: '',
      timezone: 'America/Toronto',
      luma_api_key: '',
      resend_api_key: '',
    },
  })

  // Fetch current settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings')
        if (response.ok) {
          const settings: AppSettings = await response.json()
          form.reset({
            city_name: settings.city_name,
            timezone: settings.timezone,
            luma_api_key: settings.luma_api_key || '',
            resend_api_key: settings.resend_api_key || '',
          })
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error)
        toast.error('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [form])

  const onSubmit = async (data: SettingsFormData) => {
    setSaving(true)

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const result = await response.json()
        toast.error(result.error || 'Failed to save settings')
        setSaving(false)
        return
      }

      toast.success('Settings saved successfully')
      
      // If in setup mode, show a welcome message
      if (isSetupMode) {
        toast.success('Welcome! Your city is now configured.', {
          description: 'You can access all admin features from the sidebar.',
        })
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 mt-3">
      <div>
        <h1 className="text-2xl font-medium font-sans flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure your city&apos;s Cafe Cursor deployment
        </p>
      </div>

      {isSetupMode && (
        <Alert className="bg-emerald-950/30 border-emerald-800">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <AlertTitle className="text-emerald-100">Welcome to Cafe Cursor!</AlertTitle>
          <AlertDescription className="text-emerald-200/80">
            You&apos;re the first admin for this deployment. Please configure your city settings below to get started.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>City Configuration</CardTitle>
          <CardDescription>
            These settings are displayed throughout your Cafe Cursor instance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="city_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City Name</FormLabel>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground whitespace-nowrap">Cafe Cursor</span>
                      <FormControl>
                        <Input
                          placeholder="Toronto"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Enter just the city name (e.g., &quot;Toronto&quot;, &quot;Chiang Mai&quot;)
                    </FormDescription>
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
                    <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={timezoneOpen}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? TIMEZONES.find((tz) => tz.value === field.value)?.label
                              : "Select timezone..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search timezone..." />
                          <CommandList>
                            <CommandEmpty>No timezone found.</CommandEmpty>
                            <CommandGroup>
                              {TIMEZONES.map((tz) => (
                                <CommandItem
                                  key={tz.value}
                                  value={tz.label}
                                  onSelect={() => {
                                    field.onChange(tz.value)
                                    setTimezoneOpen(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === tz.value ? "opacity-100" : "opacity-0"
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
                    <FormDescription>
                      Used for date and time formatting throughout the app
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Integrations
          </CardTitle>
          <CardDescription>
            Configure API keys for external services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="luma_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Luma API Key</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showLumaKey ? 'text' : 'password'}
                          placeholder="Enter your Luma API key"
                          {...field}
                          value={field.value || ''}
                          className="pr-10"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowLumaKey(!showLumaKey)}
                      >
                        {showLumaKey ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <FormDescription>
                      Required for syncing guests from Luma events.{' '}
                      <a 
                        href="https://lu.ma/settings/api-keys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Get your API key from Luma
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="resend_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resend API Key</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showResendKey ? 'text' : 'password'}
                          placeholder="Enter your Resend API key"
                          {...field}
                          value={field.value || ''}
                          className="pr-10"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowResendKey(!showResendKey)}
                      >
                        {showResendKey ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <FormDescription>
                      Required for sending coupon code emails.{' '}
                      <a 
                        href="https://resend.com/api-keys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Get your API key from Resend
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
