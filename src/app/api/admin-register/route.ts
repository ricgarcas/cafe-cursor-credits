import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

const adminRegisterSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  password: z.string().min(6),
  registrationSecret: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const result = adminRegisterSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.issues },
        { status: 400 }
      )
    }

    const { name, email, password, registrationSecret } = result.data

    // Validate registration secret
    const expectedSecret = process.env.ADMIN_REGISTRATION_SECRET
    if (!expectedSecret) {
      console.error('ADMIN_REGISTRATION_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (registrationSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid registration secret' },
        { status: 401 }
      )
    }

    const supabase = await createAdminClient()

    // Create the auth user using admin client
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for admin users
      user_metadata: {
        name,
        role: 'admin',
      },
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      
      // Handle specific error cases
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to create admin account' },
        { status: 500 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    // Check if this is the first admin (no settings exist)
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .single()

    // If no settings exist or there's an error (table might be empty), 
    // this is the first admin - create default settings
    let isFirstAdmin = false
    if (settingsError || !settings) {
      isFirstAdmin = true
      
      // Insert default settings
      const { error: insertError } = await supabase
        .from('app_settings')
        .insert({
          city_name: 'Cafe Cursor',
          timezone: 'America/Toronto',
        })

      if (insertError) {
        console.error('Error creating default settings:', insertError)
        // Don't fail registration if settings creation fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Admin account created successfully',
      redirect: isFirstAdmin ? '/admin/settings?setup=true' : '/admin/dashboard',
    })
  } catch (error) {
    console.error('Admin registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

