export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          device_id: string
          id: string
          kind: string
          lat: number | null
          lng: number | null
          message: string | null
          read: boolean
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          kind: string
          lat?: number | null
          lng?: number | null
          message?: string | null
          read?: boolean
          severity: string
          title: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          message?: string | null
          read?: boolean
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      commands: {
        Row: {
          ack_at: string | null
          created_at: string
          device_id: string
          id: string
          issued_by: string
          kind: string
          payload: Json | null
          sent_at: string | null
          status: string
        }
        Insert: {
          ack_at?: string | null
          created_at?: string
          device_id: string
          id?: string
          issued_by: string
          kind: string
          payload?: Json | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          ack_at?: string | null
          created_at?: string
          device_id?: string
          id?: string
          issued_by?: string
          kind?: string
          payload?: Json | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_keys: {
        Row: {
          device_id: string
          hmac_secret: string
          rotated_at: string
        }
        Insert: {
          device_id: string
          hmac_secret: string
          rotated_at?: string
        }
        Update: {
          device_id?: string
          hmac_secret?: string
          rotated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_keys_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          firmware: string | null
          id: string
          internal_id: string | null
          is_online: boolean
          last_seen_at: string | null
          name: string
          owner_id: string
          pairing_code: string | null
          plate: string | null
          updated_at: string
          vehicle_category: string | null
          vehicle_model: string | null
          vehicle_type: string | null
          vehicle_year: number | null
        }
        Insert: {
          created_at?: string
          firmware?: string | null
          id?: string
          internal_id?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          name?: string
          owner_id: string
          pairing_code?: string | null
          plate?: string | null
          updated_at?: string
          vehicle_category?: string | null
          vehicle_model?: string | null
          vehicle_type?: string | null
          vehicle_year?: number | null
        }
        Update: {
          created_at?: string
          firmware?: string | null
          id?: string
          internal_id?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          name?: string
          owner_id?: string
          pairing_code?: string | null
          plate?: string | null
          updated_at?: string
          vehicle_category?: string | null
          vehicle_model?: string | null
          vehicle_type?: string | null
          vehicle_year?: number | null
        }
        Relationships: []
      }
      geofences: {
        Row: {
          active: boolean
          alert_on_enter: boolean
          alert_on_exit: boolean
          created_at: string
          device_id: string | null
          id: string
          lat: number
          lng: number
          name: string
          owner_id: string | null
          radius_m: number
          shape: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          alert_on_enter?: boolean
          alert_on_exit?: boolean
          created_at?: string
          device_id?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          owner_id?: string | null
          radius_m?: number
          shape: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          alert_on_enter?: boolean
          alert_on_exit?: boolean
          created_at?: string
          device_id?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          owner_id?: string | null
          radius_m?: number
          shape?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string
          device_id: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          device_id: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          device_id?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          id: string
          device_id: string
          owner_id: string
          record_type: string
          title: string
          description: string | null
          cost_xof: number
          mileage_km: number | null
          performed_at: string
          next_due_at: string | null
          next_due_km: number | null
          parts_replaced: string[] | null
          garage: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          device_id: string
          owner_id: string
          record_type?: string
          title: string
          description?: string | null
          cost_xof?: number
          mileage_km?: number | null
          performed_at?: string
          next_due_at?: string | null
          next_due_km?: number | null
          parts_replaced?: string[] | null
          garage?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          device_id?: string
          owner_id?: string
          record_type?: string
          title?: string
          description?: string | null
          cost_xof?: number
          mileage_km?: number | null
          performed_at?: string
          next_due_at?: string | null
          next_due_km?: number | null
          parts_replaced?: string[] | null
          garage?: string | null
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry: {
        Row: {
          accel_x: number | null
          accel_y: number | null
          accel_z: number | null
          altitude: number | null
          battery_backup: number | null
          battery_main: number | null
          cellular_mode: string | null
          device_id: string
          engine_on: boolean | null
          gps_source: string | null
          gsm_bars: number | null
          gsm_carrier: string | null
          hdop: number | null
          heading: number | null
          id: number
          lat: number
          lng: number
          raw: Json | null
          recorded_at: string
          satellites: number | null
          speed_kmh: number | null
        }
        Insert: {
          accel_x?: number | null
          accel_y?: number | null
          accel_z?: number | null
          altitude?: number | null
          battery_backup?: number | null
          battery_main?: number | null
          cellular_mode?: string | null
          device_id: string
          engine_on?: boolean | null
          gps_source?: string | null
          gsm_bars?: number | null
          gsm_carrier?: string | null
          hdop?: number | null
          heading?: number | null
          id?: number
          lat: number
          lng: number
          raw?: Json | null
          recorded_at?: string
          satellites?: number | null
          speed_kmh?: number | null
        }
        Update: {
          accel_x?: number | null
          accel_y?: number | null
          accel_z?: number | null
          altitude?: number | null
          battery_backup?: number | null
          battery_main?: number | null
          cellular_mode?: string | null
          device_id?: string
          engine_on?: boolean | null
          gps_source?: string | null
          gsm_bars?: number | null
          gsm_carrier?: string | null
          hdop?: number | null
          heading?: number | null
          id?: number
          lat?: number
          lng?: number
          raw?: Json | null
          recorded_at?: string
          satellites?: number | null
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_status: {
        Row: {
          device_id: string
          availability: string
          total_km: number
          avg_fuel_lph: number | null
          engine_hours: number
          last_maintenance_at: string | null
          next_maintenance_at: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          device_id: string
          availability?: string
          total_km?: number
          avg_fuel_lph?: number | null
          engine_hours?: number
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          device_id?: string
          availability?: string
          total_km?: number
          avg_fuel_lph?: number | null
          engine_hours?: number
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_status_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          updated_at?: string
          user_id?: string
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
