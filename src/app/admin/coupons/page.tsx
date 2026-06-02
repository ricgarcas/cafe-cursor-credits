import { Suspense } from 'react'
import { CouponManagement } from '@/components/admin/coupon-management'

export const dynamic = 'force-dynamic'

export default function CouponsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Codes</h1>
        <p className="text-muted-foreground mt-1">
          Manage your Cursor credit code inventory.
        </p>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
        <CouponManagement />
      </Suspense>
    </div>
  )
}
