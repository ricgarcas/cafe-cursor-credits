import { NextResponse } from 'next/server'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'

const DEFAULTS = {
  city_name: 'Cafe Cursor',
  timezone: 'America/Mexico_City',
  language: 'en',
  event_tagline: null,
  claim_enabled: true,
  claim_passcode_required: false,
}

const withEnv = (o: object) => ({
  ...o,
  setup_phrase_required: Boolean(process.env.ADMIN_SETUP_PHRASE),
})

export async function GET() {
  try {
    await ensureDefaultSettings()
    const [row] = await db.select().from(appSettings).limit(1)
    if (!row) return NextResponse.json(withEnv(DEFAULTS))
    const event = await getActiveEvent()
    return NextResponse.json(withEnv({
      city_name: row.cityName,
      timezone: row.timezone,
      language: row.language,
      event_tagline: row.eventTagline,
      claim_enabled: row.claimEnabled,
      claim_passcode_required: Boolean(event.claimPasscode),
    }))
  } catch (e) {
    console.error('public settings error', e)
    return NextResponse.json(withEnv(DEFAULTS))
  }
}
