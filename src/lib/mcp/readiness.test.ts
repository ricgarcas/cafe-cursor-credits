import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { appSettings, couponCodes, events, eventAttendees } from '@/lib/db/schema'
import { getReadiness } from './readiness'

const byKey = (items: Awaited<ReturnType<typeof getReadiness>>['items'], key: string) =>
  items.find((i) => i.key === key)!

describe('getReadiness', () => {
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

  it('fails every gate on an empty deployment', async () => {
    const { ready, items } = await getReadiness()
    expect(ready).toBe(false)
    expect(byKey(items, 'codes').status).toBe('fail')
    expect(byKey(items, 'email').status).toBe('fail')
    expect(byKey(items, 'luma').status).toBe('fail')
  })

  it('passes codes once inventory exists', async () => {
    await db.insert(couponCodes).values([{ code: 'A1' }, { code: 'B2' }])
    const { items } = await getReadiness()
    const codes = byKey(items, 'codes')
    expect(codes.status).toBe('pass')
    expect(codes.detail).toContain('2')
  })

  it('warns when every code is already used', async () => {
    await db.insert(couponCodes).values([{ code: 'A1', isUsed: true }])
    expect(byKey((await getReadiness()).items, 'codes').status).toBe('warn')
  })

  it('passes email when a resend key is configured', async () => {
    await db.insert(appSettings).values({
      cityName: 'CDMX',
      emailProvider: 'resend',
      resendApiKey: 're_test',
    })
    expect(byKey((await getReadiness()).items, 'email').status).toBe('pass')
  })

  it('warns when the claim portal is closed', async () => {
    await db.insert(appSettings).values({ cityName: 'CDMX', claimEnabled: false })
    expect(byKey((await getReadiness()).items, 'claim').status).toBe('warn')
  })

  it('is ready when event, codes and email all pass', async () => {
    await db.insert(appSettings).values({
      cityName: 'CDMX',
      emailProvider: 'resend',
      resendApiKey: 're_test',
      claimEnabled: true,
    })
    await db.insert(events).values({
      name: 'Cafe Cursor CDMX',
      eventDate: '2026-09-12',
      status: 'active',
    })
    await db.insert(couponCodes).values([{ code: 'A1' }])
    expect((await getReadiness()).ready).toBe(true)
  })
})
