import { NextResponse } from 'next/server'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'

const DEFAULTS = {
  city_name: 'Cafe Cursor',
  timezone: 'America/Mexico_City',
  language: 'en',
  brand_accent: 'orange' as const,
  event_tagline: null,
}

export async function GET() {
  try {
    await ensureDefaultSettings()
    const [row] = await db.select().from(appSettings).limit(1)
    if (!row) return NextResponse.json(DEFAULTS)
    return NextResponse.json({
      city_name: row.cityName,
      timezone: row.timezone,
      language: row.language,
      brand_accent: row.brandAccent,
      event_tagline: row.eventTagline,
    })
  } catch (e) {
    console.error('public settings error', e)
    return NextResponse.json(DEFAULTS)
  }
}
