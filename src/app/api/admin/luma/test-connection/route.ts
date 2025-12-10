import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createLumaService } from '@/lib/luma/service'

export async function GET() {
  try {
    // Fetch API key from database
    const supabase = await createAdminClient()
    const { data: settings } = await supabase
      .from('app_settings')
      .select('luma_api_key')
      .limit(1)
      .single()

    if (!settings?.luma_api_key) {
      return NextResponse.json(
        { success: false, error: 'Luma API key not configured. Please set it in Settings.' },
        { status: 400 }
      )
    }

    const luma = createLumaService(settings.luma_api_key)
    const result = await luma.testConnection()

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Successfully connected to Luma API',
        user: result.user,
      })
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    )
  } catch (error) {
    console.error('Luma connection test failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    )
  }
}

