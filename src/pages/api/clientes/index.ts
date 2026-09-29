/**
 * GET  /api/clientes          — lista todos los clientes
 * POST /api/clientes          — crea un nuevo cliente
 *
 * Ambas operaciones requieren sesión activa con rol 'admin'.
 */
import type { APIRoute } from 'astro';
import { createServerClient } from '../../../db/supabase';
import type { ClienteInsert } from '../../../types/database';

// ── Helpers ──────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Verifica sesión y devuelve el user, o lanza una Response de error. */
async function requireAdmin(cookies: Parameters<typeof createServerClient>[0], request: Request) {
  const supabase = createServerClient(cookies, request);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase, authError: json({ ok: false, error: 'No autenticado.' }, 401) };
  }

  // Verificar rol en tabla perfiles
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single();

  if (perfil?.rol !== 'admin') {
    return { user: null, supabase, authError: json({ ok: false, error: 'Acceso denegado. Se requiere rol admin.' }, 403) };
  }

  return { user, supabase, authError: null };
}

// ── GET ───────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ cookies, request, url }) => {
  const { supabase, authError } = await requireAdmin(cookies, request);
  if (authError) return authError;

  // Filtros opcionales: ?estado=true|false  ?search=texto
  const estadoParam = url.searchParams.get('estado');
  const search      = url.searchParams.get('search')?.trim() ?? '';

  let query = supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false });

  if (estadoParam !== null) {
    query = query.eq('estado', estadoParam === 'true');
  }
  if (search) {
    query = query.or(
      `nombre_restaurante.ilike.%${search}%,slug.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);
  return json({ ok: true, data });
};

// ── POST ──────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ cookies, request }) => {
  const { supabase, authError } = await requireAdmin(cookies, request);
  if (authError) return authError;

  let body: Partial<ClienteInsert> & { password?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  const { nombre_restaurante, slug, telefono, fecha_inicio, fecha_pago, estado, user_id } = body;

  // ── Validación ───────────────────────────────────────────────
  if (!nombre_restaurante?.trim()) return json({ ok: false, error: 'nombre_restaurante es obligatorio.' }, 400);
  if (!slug?.trim())               return json({ ok: false, error: 'slug es obligatorio.' }, 400);
  if (!fecha_inicio)               return json({ ok: false, error: 'fecha_inicio es obligatorio (YYYY-MM-DD).' }, 400);
  if (!fecha_pago)                 return json({ ok: false, error: 'fecha_pago es obligatorio (YYYY-MM-DD).' }, 400);

  // slug: solo minúsculas, números y guiones
  if (!/^[a-z0-9-]{2,80}$/.test(slug.trim())) {
    return json({ ok: false, error: 'slug inválido. Solo minúsculas, números y guiones (2-80 caracteres).' }, 400);
  }

  const payload: ClienteInsert = {
    nombre_restaurante: nombre_restaurante.trim(),
    slug:               slug.trim().toLowerCase(),
    telefono:           telefono?.trim() || null,
    fecha_inicio,
    fecha_pago,
    estado:             estado ?? true,
    user_id:            user_id ?? null,
  };

  const { data, error } = await supabase
    .from('clientes')
    .insert([payload])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return json({ ok: false, error: `Ya existe un cliente con ese slug: "${slug}".` }, 409);
    }
    return json({ ok: false, error: error.message, details: error.details }, 500);
  }

  return json({ ok: true, data }, 201);
};
