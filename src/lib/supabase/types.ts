// Hand-written Postgres schema types for the typed Supabase client. We extend
// this table-by-table as each phase lands its tables (matching
// ttn-chords-supabase-schema.md). Keeping it hand-written (rather than generated)
// avoids a codegen step; the trade-off is we update it when the schema changes.

export type Role = 'user' | 'admin';

// JSON column values. The rich app aggregates (Song, Setlist) are stored in
// `content` jsonb columns; we cast to/from the app types at the repo boundary.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: Role;
          created_at: string;
        };
        // id comes from auth.users; display_name/role default server-side.
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          role?: Role;
          created_at?: string;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          // role changes are guarded server-side (admins only).
          role?: Role;
        };
        Relationships: [];
      };
      // A song is EITHER personal (owner_id) OR paid bundle content (bundle_id).
      // The full app Song aggregate lives in `content`; `title` is mirrored.
      songs: {
        Row: {
          id: string;
          owner_id: string | null;
          bundle_id: string | null;
          title: string;
          content: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          owner_id?: string | null;
          bundle_id?: string | null;
          title: string;
          content?: Json;
          created_at?: string;
        };
        Update: {
          owner_id?: string | null;
          bundle_id?: string | null;
          title?: string;
          content?: Json;
        };
        Relationships: [];
      };
      // JSON aggregate: the full app Setlist (incl. entries[]) lives in `content`.
      setlists: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          content: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          description?: string | null;
          content?: Json;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          content?: Json;
        };
        Relationships: [];
      };
      song_notes: {
        Row: {
          id: string;
          user_id: string;
          song_id: string;
          body: string;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          song_id: string;
          body?: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          is_public?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      bundles: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          price_cents: number;
          square_link_url: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          price_cents?: number;
          square_link_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          price_cents?: number;
          square_link_url?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      entitlements: {
        Row: {
          id: string;
          user_id: string;
          bundle_id: string;
          source: 'purchase' | 'code' | 'admin_grant';
          granted_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          bundle_id: string;
          source: 'purchase' | 'code' | 'admin_grant';
          granted_at?: string;
        };
        Update: {
          source?: 'purchase' | 'code' | 'admin_grant';
        };
        Relationships: [];
      };
      access_codes: {
        Row: {
          code: string;
          bundle_id: string;
          redeemed_by: string | null;
          redeemed_at: string | null;
          created_at: string;
        };
        Insert: {
          code: string;
          bundle_id: string;
          redeemed_by?: string | null;
          redeemed_at?: string | null;
          created_at?: string;
        };
        Update: {
          redeemed_by?: string | null;
          redeemed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      storefront_bundles: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          title: string;
          description: string | null;
          price_cents: number;
          square_link_url: string | null;
          song_count: number;
        }[];
      };
      bundle_song_titles: {
        Args: { p_bundle_id: string };
        Returns: { id: string; title: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type SongNoteRow = Database['public']['Tables']['song_notes']['Row'];
export type Bundle = Database['public']['Tables']['bundles']['Row'];
export type Entitlement = Database['public']['Tables']['entitlements']['Row'];
export type AccessCode = Database['public']['Tables']['access_codes']['Row'];
export type StorefrontBundle =
  Database['public']['Functions']['storefront_bundles']['Returns'][number];
export type BundleSongTitle =
  Database['public']['Functions']['bundle_song_titles']['Returns'][number];
