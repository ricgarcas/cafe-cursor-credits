import { NextResponse } from 'next/server'
import { getLumaService } from '@/lib/luma/service'

export async function GET() {
  try {
    const luma = getLumaService()
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

