import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

const settingsUpdateSchema = z.object({
  city_name: z.string().min(1).max(255),
  timezone: z.string().min(1).max(100),
})

// Default settings to return if table doesn't exist or is empty
const DEFAULT_SETTINGS = {
  id: 0,
  city_name: 'Cafe Cursor',
  timezone: 'America/Toronto',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

// GET - Fetch current settings
export async function GET() {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch settings using admin client to ensure we can read
    const adminSupabase = await createAdminClient()
    const { data: settings, error } = await adminSupabase
      .from('app_settings')
      .select('*')
      .limit(1)
      .single()

    if (error) {
      // If table doesn't exist or no rows, return defaults
      console.log('Settings not found, returning defaults:', error.message)
      return NextResponse.json(DEFAULT_SETTINGS)
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Settings GET error:', error)
    // Return defaults on any error
    return NextResponse.json(DEFAULT_SETTINGS)
  }
}

// PUT - Update settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    // Validate input
    const result = settingsUpdateSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.issues },
        { status: 400 }
      )
    }

    const { city_name, timezone } = result.data

    // Use admin client to update settings (bypasses RLS)
    const adminSupabase = await createAdminClient()
    
    // Get the current settings row ID first
    const { data: currentSettings, error: fetchError } = await adminSupabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .single()

    if (fetchError || !currentSettings) {
      // If no settings exist, create them
      const { data: newSettings, error: insertError } = await adminSupabase
        .from('app_settings')
        .insert({ city_name, timezone })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating settings:', insertError)
        return NextResponse.json(
          { error: 'Failed to create settings' },
          { status: 500 }
        )
      }

      return NextResponse.json(newSettings)
    }

    // Update existing settings
    const { data: updatedSettings, error: updateError } = await adminSupabase
      .from('app_settings')
      .update({ city_name, timezone })
      .eq('id', currentSettings.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating settings:', updateError)
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedSettings)
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

