'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/admin/dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
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
          Cafe Cursor <br /> Toronto
        </h1>

        {/* Card */}
        <Card className="w-full max-w-md bg-zinc-950 border-zinc-800 shadow-lg">
          <CardContent className="px-8 pt-3 pb-6">
            <CardHeader className="p-0 pb-6 text-center gap-0">
              <CardTitle className="text-2xl text-white mb-0">Admin Login</CardTitle>
              <CardDescription className="text-zinc-400">
                Sign in to access the admin dashboard
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-950/50 border-red-900 text-red-200">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black hover:bg-zinc-200 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
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

