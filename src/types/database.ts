export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      attendees: {
        Row: {
          id: number
          name: string
          email: string
          coupon_code_id: number | null
          registered_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          name: string
          email: string
          coupon_code_id?: number | null
          registered_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          name?: string
          email?: string
          coupon_code_id?: number | null
          registered_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendees_coupon_code_id_fkey"
            columns: ["coupon_code_id"]
            isOneToOne: false
            referencedRelation: "coupon_codes"
            referencedColumns: ["id"]
          }
        ]
      }
      coupon_codes: {
        Row: {
          id: number
          code: string
          is_used: boolean
          used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          code: string
          is_used?: boolean
          used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          code?: string
          is_used?: boolean
          used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type Attendee = Database['public']['Tables']['attendees']['Row']
export type AttendeeInsert = Database['public']['Tables']['attendees']['Insert']
export type AttendeeUpdate = Database['public']['Tables']['attendees']['Update']

export type CouponCode = Database['public']['Tables']['coupon_codes']['Row']
export type CouponCodeInsert = Database['public']['Tables']['coupon_codes']['Insert']
export type CouponCodeUpdate = Database['public']['Tables']['coupon_codes']['Update']

// Extended types with relationships
export type AttendeeWithCoupon = Attendee & {
  coupon_codes: CouponCode | null
}

