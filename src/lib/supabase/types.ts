// Hand-written Postgres schema types for the typed Supabase client. We extend
// this table-by-table as each phase lands its tables (matching
// ttn-chords-supabase-schema.md). Keeping it hand-written (rather than generated)
// avoids a codegen step; the trade-off is we update it when the schema changes.

export type Role = 'user' | 'admin';

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
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
