'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Loader2, ShieldCheck } from 'lucide-react'

const adminRegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Please enter a valid email address').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  registrationSecret: z.string().min(1, 'Registration secret is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type AdminRegisterFormData = z.infer<typeof adminRegisterSchema>

export default function AdminRegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cityName, setCityName] = useState('Cafe Cursor')
  const router = useRouter()

  // Fetch city name from settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/public')
        if (response.ok) {
          const settings = await response.json()
          setCityName(settings.city_name)
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error)
      }
    }
    fetchSettings()
  }, [])

  const form = useForm<AdminRegisterFormData>({
    resolver: zodResolver(adminRegisterSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      registrationSecret: '',
    },
  })

  const onSubmit = async (data: AdminRegisterFormData) => {
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/admin-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          registrationSecret: data.registrationSecret,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Registration failed')
        setLoading(false)
        return
      }

      // Redirect based on response
      router.push(result.redirect || '/admin/dashboard')
      router.refresh()
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-black relative text-gray-100 flex flex-col items-center justify-center p-4 md:p-6">
      {/* Circuit Board - Dark Pattern */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255, 255, 255, 0.06) 19px, rgba(255, 255, 255, 0.06) 20px, transparent 20px, transparent 39px, rgba(255, 255, 255, 0.06) 39px, rgba(255, 255, 255, 0.06) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(255, 255, 255, 0.06) 19px, rgba(255, 255, 255, 0.06) 20px, transparent 20px, transparent 39px, rgba(255, 255, 255, 0.06) 39px, rgba(255, 255, 255, 0.06) 40px),
            radial-gradient(circle at 20px 20px, rgba(255, 255, 255, 0.1) 2px, transparent 2px),
            radial-gradient(circle at 40px 40px, rgba(255, 255, 255, 0.1) 2px, transparent 2px)
          `,
          backgroundSize: '40px 40px, 40px 40px, 40px 40px, 40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-4 w-full">
        {/* Logo */}
        <div className="h-14 w-14 md:h-18 md:w-18">
          <img 
            src="/assets/cursor-cube-logo-dark.svg" 
            alt="Cursor Logo" 
            className="h-full w-full"
          />
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-normal text-white text-center leading-tighter tracking-tight mb-4">
          Cafe Cursor
          <span className="block">{cityName}</span>
        </h1>

        {/* Card */}
        <Card className="w-full max-w-md bg-zinc-950 border-zinc-800 shadow-lg">
          <CardContent className="px-8 pt-3 pb-6">
            <CardHeader className="p-0 pb-6 text-center gap-0">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                <CardTitle className="text-2xl text-white mb-0">Admin Registration</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Register as an admin using the secret phrase provided by your city organizer
              </CardDescription>
            </CardHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="bg-red-950/50 border-red-900 text-red-200">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John Smith"
                          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@example.com"
                          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registrationSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Registration Secret</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter the secret phrase"
                          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black hover:bg-zinc-200 mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Admin Account'
                  )}
                </Button>

                <div className="text-center text-sm text-zinc-500 pt-2">
                  Already have an account?{' '}
                  <Link href="/login" className="text-zinc-300 hover:text-white underline">
                    Sign in
                  </Link>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Footer logo */}
        <div className="flex items-center justify-center pt-4">
          <a href="https://www.cursor.com/" target="_blank" rel="noopener noreferrer">
            <img 
              src="/assets/cursor-cube-logo-dark.svg" 
              alt="Cursor Logo" 
              className="h-8 w-8 opacity-50 hover:opacity-80 transition-opacity"
            />
          </a>
        </div>
      </div>
    </div>
  )
}

