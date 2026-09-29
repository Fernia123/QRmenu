import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (
  import.meta.env.PUBLIC_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_URL : '') ||
  ''
).trim();

// Para operaciones administrativas (como auth.admin.createUser) se requiere SUPABASE_SERVICE_ROLE_KEY
const supabaseKey = (
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : '') ||
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_ANON_KEY : '') ||
  ''
).trim();

export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('tu-proyecto')
);

export const supabaseAdmin: SupabaseClient | null = isSupabaseAdminConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;