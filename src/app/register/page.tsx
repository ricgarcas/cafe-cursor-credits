'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Loader2, CheckCircle } from 'lucide-react'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Please enter a valid email address').max(255),
})

type RegisterFormData = z.infer<typeof registerSchema>

interface RegistrationResult {
  success: boolean
  couponAssigned: boolean
  message?: string
}

export default function RegisterPage() {
  const [result, setResult] = useState<RegistrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cityName, setCityName] = useState('Cafe Cursor')

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

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
    },
  })

  const onSubmit = async (data: RegisterFormData) => {
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Registration failed')
        setLoading(false)
        return
      }

      setResult(result)
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterAnother = () => {
    setResult(null)
    setError(null)
    form.reset()
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
            {result ? (
              <div className="flex flex-col gap-6">
                <Alert className="bg-emerald-950/50 border-emerald-800 text-emerald-100">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <AlertTitle className="text-emerald-100">Registration Successful!</AlertTitle>
                  <AlertDescription className="text-emerald-200/80">
                    Thank you for registering for Cafe Cursor {cityName}.
                    {result.couponAssigned && (
                      <span className="block mt-2">
                        Please check your email for your coupon code.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleRegisterAnother}
                  variant="outline"
                  className="w-full bg-zinc-800/50 border-zinc-700 border-dashed text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Register Another Attendee
                </Button>
              </div>
            ) : (
              <>
                <CardHeader className="p-0 pb-6 text-center gap-0">
                  <CardTitle className="text-2xl text-white mb-0">Register for Cursor Credits</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Enter your details to register and receive free Cursor Credits!
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
                              placeholder="john@example.com"
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
                          Registering...
                        </>
                      ) : (
                        'Register'
                      )}
                    </Button>
                  </form>
                </Form>
              </>
            )}
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

