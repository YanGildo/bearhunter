import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sem as variáveis de ambiente o app roda em "modo local" (sem login), como na v1. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const AUTH_ENABLED = !!supabase;

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  status: 'pending' | 'active' | 'blocked';
  is_admin: boolean;
  operators_enabled: boolean;
  created_at: string;
}
