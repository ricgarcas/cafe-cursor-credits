import { Suspense } from 'react'
import { CouponManagement } from '@/components/admin/coupon-management'

export const dynamic = 'force-dynamic'

export default function CouponsPage() {
  return (
    <div className="space-y-6 mt-3">
      <div>
        <h1 className="text-2xl font-medium font-sans">Coupon Codes</h1>
        <p className="text-muted-foreground">Manage coupon codes for event attendees</p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <CouponManagement />
      </Suspense>
    </div>
  )
}

