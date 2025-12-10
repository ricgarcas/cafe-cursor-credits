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
          // Luma integration fields
          luma_guest_id: string | null
          luma_event_id: string | null
          source: 'manual' | 'luma' | 'website'
        }
        Insert: {
          id?: never
          name: string
          email: string
          coupon_code_id?: number | null
          registered_at?: string
          created_at?: string
          updated_at?: string
          luma_guest_id?: string | null
          luma_event_id?: string | null
          source?: 'manual' | 'luma' | 'website'
        }
        Update: {
          id?: never
          name?: string
          email?: string
          coupon_code_id?: number | null
          registered_at?: string
          created_at?: string
          updated_at?: string
          luma_guest_id?: string | null
          luma_event_id?: string | null
          source?: 'manual' | 'luma' | 'website'
        }
        Relationships: [
          {
            foreignKeyName: "attendees_coupon_code_id_fkey"
            columns: ["coupon_code_id"]
            isOneToOne: false
            referencedRelation: "coupon_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendees_luma_guest_id_fkey"
            columns: ["luma_guest_id"]
            isOneToOne: false
            referencedRelation: "luma_guests"
            referencedColumns: ["luma_guest_id"]
          },
          {
            foreignKeyName: "attendees_luma_event_id_fkey"
            columns: ["luma_event_id"]
            isOneToOne: false
            referencedRelation: "luma_events"
            referencedColumns: ["luma_event_id"]
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
      luma_events: {
        Row: {
          id: number
          luma_event_id: string
          name: string
          description: string | null
          start_at: string
          end_at: string
          timezone: string
          url: string | null
          cover_url: string | null
          guest_count: number
          location_type: 'physical' | 'online' | 'tbd' | null
          location_name: string | null
          location_address: string | null
          visibility: 'public' | 'private' | 'unlisted'
          is_sync_enabled: boolean
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          luma_event_id: string
          name: string
          description?: string | null
          start_at: string
          end_at: string
          timezone?: string
          url?: string | null
          cover_url?: string | null
          guest_count?: number
          location_type?: 'physical' | 'online' | 'tbd' | null
          location_name?: string | null
          location_address?: string | null
          visibility?: 'public' | 'private' | 'unlisted'
          is_sync_enabled?: boolean
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          luma_event_id?: string
          name?: string
          description?: string | null
          start_at?: string
          end_at?: string
          timezone?: string
          url?: string | null
          cover_url?: string | null
          guest_count?: number
          location_type?: 'physical' | 'online' | 'tbd' | null
          location_name?: string | null
          location_address?: string | null
          visibility?: 'public' | 'private' | 'unlisted'
          is_sync_enabled?: boolean
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      luma_guests: {
        Row: {
          id: number
          luma_guest_id: string
          luma_event_id: string
          guest_key: string
          name: string
          email: string
          registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
          approval_status: string | null
          attendance_status: string | null
          registered_at: string | null
          synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          luma_guest_id: string
          luma_event_id: string
          guest_key: string
          name: string
          email: string
          registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
          approval_status?: string | null
          attendance_status?: string | null
          registered_at?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          luma_guest_id?: string
          luma_event_id?: string
          guest_key?: string
          name?: string
          email?: string
          registration_status?: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
          approval_status?: string | null
          attendance_status?: string | null
          registered_at?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "luma_guests_luma_event_id_fkey"
            columns: ["luma_event_id"]
            isOneToOne: false
            referencedRelation: "luma_events"
            referencedColumns: ["luma_event_id"]
          }
        ]
      }
      luma_sync_logs: {
        Row: {
          id: number
          luma_event_id: string | null
          sync_type: 'manual' | 'scheduled' | 'webhook'
          status: 'started' | 'completed' | 'failed'
          guests_synced: number
          guests_added: number
          guests_updated: number
          coupons_assigned: number
          error_message: string | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: never
          luma_event_id?: string | null
          sync_type: 'manual' | 'scheduled' | 'webhook'
          status: 'started' | 'completed' | 'failed'
          guests_synced?: number
          guests_added?: number
          guests_updated?: number
          coupons_assigned?: number
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          luma_event_id?: string | null
          sync_type?: 'manual' | 'scheduled' | 'webhook'
          status?: 'started' | 'completed' | 'failed'
          guests_synced?: number
          guests_added?: number
          guests_updated?: number
          coupons_assigned?: number
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "luma_sync_logs_luma_event_id_fkey"
            columns: ["luma_event_id"]
            isOneToOne: false
            referencedRelation: "luma_events"
            referencedColumns: ["luma_event_id"]
          }
        ]
      }
      app_settings: {
        Row: {
          id: number
          city_name: string
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          city_name?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          city_name?: string
          timezone?: string
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

// Luma table convenience types
export type LumaEventRow = Database['public']['Tables']['luma_events']['Row']
export type LumaEventInsert = Database['public']['Tables']['luma_events']['Insert']
export type LumaEventUpdate = Database['public']['Tables']['luma_events']['Update']

export type LumaGuestRow = Database['public']['Tables']['luma_guests']['Row']
export type LumaGuestInsert = Database['public']['Tables']['luma_guests']['Insert']
export type LumaGuestUpdate = Database['public']['Tables']['luma_guests']['Update']

export type LumaSyncLogRow = Database['public']['Tables']['luma_sync_logs']['Row']
export type LumaSyncLogInsert = Database['public']['Tables']['luma_sync_logs']['Insert']
export type LumaSyncLogUpdate = Database['public']['Tables']['luma_sync_logs']['Update']

// Extended types with relationships
export type LumaGuestWithEvent = LumaGuestRow & {
  luma_events: LumaEventRow | null
}

export type LumaGuestWithCoupon = LumaGuestRow & {
  attendees: (Attendee & { coupon_codes: CouponCode | null }) | null
}

// App Settings convenience types
export type AppSettings = Database['public']['Tables']['app_settings']['Row']
export type AppSettingsInsert = Database['public']['Tables']['app_settings']['Insert']
export type AppSettingsUpdate = Database['public']['Tables']['app_settings']['Update']
