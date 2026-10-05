// Placeholder — regenera con:
//   pnpm gen:types    (usa el CLI oficial: supabase gen types typescript ...)
// Este archivo se mantiene mínimo para que TypeScript no falle antes
// de correr el generador. Todos los clientes Supabase importan `Database`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; slug: string; timezone: string; created_at: string };
        Insert: { id?: string; name: string; slug: string; timezone?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; organization_id: string; full_name: string | null; role: "owner" | "staff"; created_at: string };
        Insert: { id: string; organization_id: string; full_name?: string | null; role?: "owner" | "staff"; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      whatsapp_configs: {
        Row: { organization_id: string; phone_number_id: string; waba_id: string; access_token_encrypted: string; verify_token: string; app_secret_encrypted: string; updated_at: string };
        Insert: { organization_id: string; phone_number_id: string; waba_id: string; access_token_encrypted: string; verify_token: string; app_secret_encrypted: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["whatsapp_configs"]["Insert"]>;
        Relationships: [];
      };
      google_calendar_configs: {
        Row: { organization_id: string; calendar_id: string; refresh_token_encrypted: string; access_token_encrypted: string | null; token_expires_at: string | null; updated_at: string };
        Insert: { organization_id: string; calendar_id: string; refresh_token_encrypted: string; access_token_encrypted?: string | null; token_expires_at?: string | null; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["google_calendar_configs"]["Insert"]>;
        Relationships: [];
      };
      agent_configs: {
        Row: { organization_id: string; system_prompt: string; tone: string; business_info: Json; services: Json; business_hours: Json; handoff_message: string | null; updated_at: string };
        Insert: { organization_id: string; system_prompt: string; tone?: string; business_info?: Json; services?: Json; business_hours?: Json; handoff_message?: string | null; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["agent_configs"]["Insert"]>;
        Relationships: [];
      };
      org_subscriptions: {
        Row: { organization_id: string; status: SubscriptionStatus; trial_ends_at: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: string | null; cancel_at_period_end: boolean; updated_at: string };
        Insert: { organization_id: string; status?: SubscriptionStatus; trial_ends_at?: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; current_period_end?: string | null; cancel_at_period_end?: boolean; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["org_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: { id: string; organization_id: string; wa_phone: string; full_name: string | null; is_new_patient: boolean | null; metadata: Json; created_at: string };
        Insert: { id?: string; organization_id: string; wa_phone: string; full_name?: string | null; is_new_patient?: boolean | null; metadata?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      conversations: {
        Row: { id: string; organization_id: string; contact_id: string; bot_active: boolean; last_message_at: string; created_at: string };
        Insert: { id?: string; organization_id: string; contact_id: string; bot_active?: boolean; last_message_at?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: { id: string; conversation_id: string; organization_id: string; wa_message_id: string | null; direction: "inbound" | "outbound"; sender: "contact" | "bot" | "human"; content: string | null; raw: Json | null; created_at: string };
        Insert: { id?: string; conversation_id: string; organization_id: string; wa_message_id?: string | null; direction: "inbound" | "outbound"; sender: "contact" | "bot" | "human"; content?: string | null; raw?: Json | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      properties: {
        Row: { id: string; organization_id: string; reference: string | null; title: string; location: string; property_type: string; price_eur: number; bedrooms: number; bathrooms: number; built_area_m2: number | null; plot_area_m2: number | null; features: Json; description: string | null; photo_urls: Json; video_url: string | null; virtual_tour_url: string | null; status: "available" | "reserved" | "sold" | "off_market"; agent_name: string | null; agent_phone: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; reference?: string | null; title: string; location: string; property_type?: string; price_eur: number; bedrooms?: number; bathrooms?: number; built_area_m2?: number | null; plot_area_m2?: number | null; features?: Json; description?: string | null; photo_urls?: Json; video_url?: string | null; virtual_tour_url?: string | null; status?: "available" | "reserved" | "sold" | "off_market"; agent_name?: string | null; agent_phone?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: { id: string; organization_id: string; contact_id: string; budget_min_eur: number | null; budget_max_eur: number | null; preferred_locations: Json; preferred_types: Json; min_bedrooms: number | null; min_bathrooms: number | null; needs_pool: boolean | null; needs_sea_view: boolean | null; timeline: string | null; financing: string | null; language: string | null; qualified: boolean | null; notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contact_id: string; budget_min_eur?: number | null; budget_max_eur?: number | null; preferred_locations?: Json; preferred_types?: Json; min_bedrooms?: number | null; min_bathrooms?: number | null; needs_pool?: boolean | null; needs_sea_view?: boolean | null; timeline?: string | null; financing?: string | null; language?: string | null; qualified?: boolean | null; notes?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      appointments: {
        Row: { id: string; organization_id: string; contact_id: string; service: string; starts_at: string; ends_at: string; google_event_id: string | null; status: "confirmed" | "cancelled" | "completed"; is_new_patient: boolean | null; full_name: string; phone: string; notes: string | null; property_id: string | null; visit_type: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; contact_id: string; service: string; starts_at: string; ends_at: string; google_event_id?: string | null; status?: "confirmed" | "cancelled" | "completed"; is_new_patient?: boolean | null; full_name: string; phone: string; notes?: string | null; property_id?: string | null; visit_type?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
