import { asc, eq } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { couponCodes, appSettings } from '@/lib/db/schema'
import { QrCardsClient } from '@/components/admin/qr-cards-client'

export const dynamic = 'force-dynamic'

async function getAvailableCodes() {
  const rows = await db
    .select({ id: couponCodes.id, code: couponCodes.code })
    .from(couponCodes)
    .where(eq(couponCodes.isUsed, false))
    .orderBy(asc(couponCodes.id))
    .limit(1000)
  return rows
}

async function getCity() {
  await ensureDefaultSettings()
  const [row] = await db.select().from(appSettings).limit(1)
  return { city: row?.cityName ?? 'Cafe Cursor', tagline: row?.eventTagline ?? null }
}

export default async function QrCardsPage() {
  const [codes, meta] = await Promise.all([getAvailableCodes(), getCity()])
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">QR cards</h1>
        <p className="text-muted-foreground mt-1">
          Print physical cards for in-person credit distribution. Each card
          contains one unused code — save as PDF from the browser print dialog.
        </p>
      </div>
      <QrCardsClient codes={codes} city={meta.city} tagline={meta.tagline ?? undefined} />
    </div>
  )
}
